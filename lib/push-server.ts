// Notifiche push: salvataggio dei dispositivi e invio. Solo lato server: usa la service role
// (senza RLS), quindi ogni query filtra per user_id. Le chiavi VAPID (VAPID_PUBLIC_KEY e
// VAPID_PRIVATE_KEY, su Vercel) firmano le notifiche: senza, niente parte e Account dice
// «arrivano presto». Il contenuto viaggia cifrato con le chiavi del dispositivo (RFC 8291): il
// servizio di notifiche (Google, Apple…) lo consegna ma non lo legge.
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteConfig } from "./config";
import { todayISO } from "./dates";
import { currentPeriod } from "./period";
import { mondayOf } from "./retention";
import {
  weeklyPush, WEEKLY_PUSH_TTL, MAX_DEVICES, type Device, type PushPayload, type PushSubscriptionInput,
} from "./push";

// Apple rifiuta le firme con un indirizzo localhost: in locale si usa quello del sito.
const SUBJECT = /^https:\/\/(?!localhost)/.test(siteConfig.url) ? siteConfig.url : "https://www.flussoapp.it";

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function pushConfigured(): boolean {
  return !!(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());
}

/** "gone": il dispositivo non esiste più (notifiche spente dal browser, app tolta): si cancella. */
export type SendOutcome = "ok" | "gone" | "error";
export type PushSender = (sub: PushSubscriptionInput, payload: PushPayload, ttl: number) => Promise<SendOutcome>;

export const sendPush: PushSender = async (sub, payload, ttl) => {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      {
        TTL: ttl,
        urgency: "normal",
        timeout: 10_000,
        vapidDetails: { subject: SUBJECT, publicKey: vapidPublicKey()!, privateKey: process.env.VAPID_PRIVATE_KEY!.trim() },
      },
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    // mai l'indirizzo del dispositivo nei log
    console.error("notifica non partita", status ?? (err instanceof Error ? err.name : "errore"));
    return "error";
  }
};

/**
 * Salva (o aggiorna) un dispositivo per l'utente. Un indirizzo appartiene a un solo utente: se
 * sullo stesso browser accende le notifiche un altro account, passa a lui. `replaces` è l'indirizzo
 * vecchio quando il browser lo cambia da solo (pushsubscriptionchange nel service worker).
 */
export async function storeSubscription(
  service: SupabaseClient, userId: string, sub: PushSubscriptionInput, device: Device | null, replaces?: string,
): Promise<void> {
  if (replaces && replaces !== sub.endpoint) {
    await service.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", replaces);
  }
  const { error } = await service.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, ...(device ? { device } : {}) },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(`push_subscriptions: ${error.code ?? error.message}`);

  // non più di MAX_DEVICES a testa: oltre si tolgono i più vecchi
  const { data } = await service.from("push_subscriptions").select("id")
    .eq("user_id", userId).order("created_at", { ascending: false });
  const extra = (data ?? []).slice(MAX_DEVICES).map(r => r.id as number);
  if (extra.length) await service.from("push_subscriptions").delete().eq("user_id", userId).in("id", extra);
}

export async function removeSubscription(service: SupabaseClient, userId: string, endpoint: string): Promise<void> {
  await service.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
}

type SubRow = PushSubscriptionInput & { id: number; user_id: string };

/**
 * Manda una notifica ai dispositivi dati. Cancella quelli che non esistono più e segna l'ora
 * dell'ultimo invio riuscito. Ritorna quanti l'hanno ricevuta e quanti sono stati tolti.
 */
export async function sendToDevices(
  service: SupabaseClient, rows: SubRow[], payload: PushPayload, ttl: number, send: PushSender = sendPush, now = new Date(),
): Promise<{ ok: number; gone: number; errors: number }> {
  const res = { ok: 0, gone: 0, errors: 0 };
  for (const s of rows) {
    const out = await send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, ttl);
    if (out === "ok") {
      res.ok++;
      await service.from("push_subscriptions").update({ last_ok_at: now.toISOString() }).eq("id", s.id).eq("user_id", s.user_id);
    } else if (out === "gone") {
      res.gone++;
      await service.from("push_subscriptions").delete().eq("id", s.id).eq("user_id", s.user_id);
    } else {
      res.errors++;
    }
  }
  return res;
}

/** I dispositivi di un utente (per la prova da Account e da Admin). */
export async function userDevices(service: SupabaseClient, userId: string, endpoint?: string): Promise<SubRow[]> {
  let q = service.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("user_id", userId);
  if (endpoint) q = q.eq("endpoint", endpoint);
  const { data, error } = await q;
  if (error) throw new Error(`push_subscriptions: ${error.code ?? error.message}`);
  return (data ?? []) as SubRow[];
}

/** La notifica del lunedì per un utente, o null se non ha mai caricato movimenti (come l'email). */
export async function buildWeeklyPush(service: SupabaseClient, userId: string, now = new Date()) {
  const [profRes, lastRes] = await Promise.all([
    service.from("profiles").select("pay_day").eq("id", userId).maybeSingle(),
    service.from("transactions").select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1),
  ]);
  const lastTxDate = (lastRes.data?.[0]?.date as string | undefined) ?? null;
  if (!lastTxDate) return null;
  const payDay = (profRes.data?.pay_day as number | null | undefined) ?? 0;
  return weeklyPush({ today: todayISO(now), payDay, periodTo: currentPeriod(payDay, now).to, lastTxDate });
}

export type PushRunResult = {
  /** persone raggiunte su almeno un dispositivo */
  sent: number;
  /** dispositivi raggiunti */
  devices: number;
  /** dispositivi tolti perché non esistono più */
  gone: number;
  /** invii falliti per altri motivi */
  errors: number;
  already: number;
  /** senza movimenti: niente da dire */
  skipped: number;
  variants: Record<string, number>;
  /** true se mancano le chiavi VAPID: nessuna notifica, database non toccato */
  notConfigured?: boolean;
};

/**
 * La notifica del lunedì, a chi ha acceso le notifiche su almeno un dispositivo (si accendono
 * solo a mano, quindi parte subito, senza aspettare la data delle email). Admin compreso: le ha
 * accese lui. Per ogni persona prima la riga in email_sends ("push_weekly", lunedì della
 * settimana), poi l'invio; se nessun dispositivo la riceve la riga si toglie.
 */
export async function runWeeklyPushes(
  service: SupabaseClient, now: Date = new Date(), send: PushSender = sendPush, configured = pushConfigured(),
): Promise<PushRunResult> {
  const res: PushRunResult = { sent: 0, devices: 0, gone: 0, errors: 0, already: 0, skipped: 0, variants: {} };
  if (!configured) return { ...res, notConfigured: true };
  const week = mondayOf(now);

  const byUser = new Map<string, SubRow[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth").order("id").range(from, from + 999);
    if (error) throw new Error(`push_subscriptions: ${error.code ?? error.message}`);
    for (const r of (data ?? []) as SubRow[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
    if ((data ?? []).length < 1000) break;
  }

  for (const [userId, rows] of byUser) {
    const claim = await service.from("email_sends")
      .insert({ user_id: userId, kind: "push_weekly", period_key: week })
      .select("id").maybeSingle();
    if (claim.error) {
      if (claim.error.code === "23505") res.already++;
      else res.errors++;
      continue;
    }
    const unclaim = () => service.from("email_sends").delete().eq("id", claim.data!.id);
    try {
      const payload = await buildWeeklyPush(service, userId, now);
      if (!payload) {
        await unclaim();
        res.skipped++;
        continue;
      }
      const { variant, ...message } = payload;
      const out = await sendToDevices(service, rows, message, WEEKLY_PUSH_TTL, send, now);
      res.devices += out.ok;
      res.gone += out.gone;
      res.errors += out.errors;
      if (out.ok) {
        res.sent++;
        res.variants[variant] = (res.variants[variant] ?? 0) + 1;
      } else {
        await unclaim();
      }
    } catch (err) {
      await unclaim();
      res.errors++;
      console.error("notifica del lunedì non partita", userId.slice(0, 8), err instanceof Error ? err.message : "errore");
    }
  }
  return res;
}

export type PushStats = { people: number; devices: number; byDevice: Record<string, number> };

/** Per Admin: quante persone e quali dispositivi hanno le notifiche accese. null senza la tabella. */
export async function pushStats(service: SupabaseClient): Promise<PushStats | null> {
  const stats: PushStats = { people: 0, devices: 0, byDevice: {} };
  const people = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("push_subscriptions").select("user_id, device").order("id").range(from, from + 999);
    if (error) return null;
    for (const r of data ?? []) {
      people.add(r.user_id as string);
      stats.devices++;
      const d = (r.device as string | null) ?? "Altro";
      stats.byDevice[d] = (stats.byDevice[d] ?? 0) + 1;
    }
    if ((data ?? []).length < 1000) break;
  }
  stats.people = people.size;
  return stats;
}
