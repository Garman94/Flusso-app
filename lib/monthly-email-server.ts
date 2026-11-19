// Invio dell'email del mese. Solo lato server: legge con la service role (senza RLS), quindi ogni
// query DEVE filtrare per user_id. I numeri sono quelli della pagina Mesi passati: stesse query
// (lib/recap-data.ts) e stessi calcoli (lib/recap.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteConfig } from "./config";
import { todayISO } from "./dates";
import { loadRecap } from "./recap-data";
import { unsubscribeQuery } from "./email-token";
import { recipientEmails, sendEmail } from "./weekly-email-server";
import {
  lastClosedPeriod, monthlyEmail, monthlyStarted, periodToRecap, recapReadiness,
  MONTHLY_SOURCE, type MonthlyEmail, type RecapReadiness,
} from "./monthly-email";

/** Resend accetta 2 richieste al secondo: tra un'email e l'altra si aspetta un po'. */
const PAUSE_MS = 600;

type ProfileRow = { id: string; full_name?: string | null; pay_day?: number | null };

function link(path: string, extra = ""): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${siteConfig.url}${path}${sep}da=${MONTHLY_SOURCE}${extra}`;
}

export type MonthlyBuild = {
  email: MonthlyEmail | null;
  /** "window": oggi non è nei primi giorni del periodo nuovo */
  reason: RecapReadiness | "window";
};

/**
 * L'email del mese di un utente. Senza `anyDay` rispetta le regole del giro (primi giorni del
 * periodo nuovo, riepilogo completo); con `anyDay` (Admin → «Vedila») usa l'ultimo periodo chiuso
 * e la costruisce anche se non partirebbe, dicendo perché in `reason`.
 */
export async function buildMonthlyEmail(
  service: SupabaseClient, profile: ProfileRow, now: Date = new Date(), opts: { anyDay?: boolean } = {},
): Promise<MonthlyBuild> {
  const payDay = profile.pay_day ?? 0;
  const today = todayISO(now);
  const due = periodToRecap(payDay, today);
  const sel = due ?? (opts.anyDay ? lastClosedPeriod(payDay, today) : null);
  if (!sel) return { email: null, reason: "window" };

  const { recap } = await loadRecap(service, profile.id, payDay, sel, today);
  const ready = recapReadiness(recap);
  if (recap.txCount === 0 || (ready !== "ok" && !opts.anyDay)) return { email: null, reason: ready };

  const email = monthlyEmail(
    { name: profile.full_name ?? null, payDay, recap },
    {
      recap: link("/dashboard/riepilogo"),
      plan: link("/dashboard/smart"),
      settings: link("/dashboard/account", "#avvisi"),
      unsubscribe: `${siteConfig.url}/disiscriviti?${unsubscribeQuery(profile.id, "monthly")}`,
    },
  );
  return { email, reason: due ? ready : "window" };
}

export type MonthlyRunResult = {
  sent: number; skipped: number; already: number; failed: number;
  /** perché non è partita a chi era nei primi giorni del periodo: few | incomplete | starts-late */
  notReady: Record<string, number>;
  variants: Record<string, number>;
  /** true se oggi è prima di MONTHLY_FIRST_DAY: nessuna email */
  notStarted?: boolean;
};

/**
 * Il giro di ogni giorno: tutti gli utenti con l'email del mese accesa, tranne admin e demo, che
 * sono nei primi giorni del periodo nuovo. Prima si scrive la riga in email_sends (utente,
 * "monthly", inizio del periodo chiuso): se c'è già, l'email è già partita. Se il riepilogo non
 * è pronto o l'invio fallisce la riga si toglie, e si riprova il giorno dopo.
 */
export async function runMonthlyEmails(service: SupabaseClient, now: Date = new Date()): Promise<MonthlyRunResult> {
  const res: MonthlyRunResult = { sent: 0, skipped: 0, already: 0, failed: 0, notReady: {}, variants: {} };
  const today = todayISO(now);
  if (!monthlyStarted(today)) return { ...res, notStarted: true };

  const emails = await recipientEmails(service);
  const { data: profiles, error } = await service.from("profiles").select("id, full_name, pay_day").eq("email_monthly", true);
  if (error) throw new Error(`profiles: ${error.message}`);

  for (const p of (profiles ?? []) as ProfileRow[]) {
    const to = emails.get(p.id);
    const due = to ? periodToRecap(p.pay_day ?? 0, today) : null;
    if (!to || !due) { res.skipped++; continue; }

    const claim = await service.from("email_sends")
      .insert({ user_id: p.id, kind: "monthly", period_key: due.from })
      .select("id").maybeSingle();
    if (claim.error) {
      if (claim.error.code === "23505") res.already++; // già mandata per questo periodo
      else res.failed++;
      continue;
    }

    try {
      const { email, reason } = await buildMonthlyEmail(service, p, now);
      if (!email) {
        await service.from("email_sends").delete().eq("id", claim.data!.id);
        res.notReady[reason] = (res.notReady[reason] ?? 0) + 1;
        continue;
      }
      await sendEmail(to, p.id, email, "monthly");
      res.sent++;
      res.variants[email.variant] = (res.variants[email.variant] ?? 0) + 1;
      await new Promise(r => setTimeout(r, PAUSE_MS));
    } catch (err) {
      await service.from("email_sends").delete().eq("id", claim.data!.id);
      res.failed++;
      // mai l'indirizzo o il contenuto nei log
      console.error("email del mese non partita", p.id.slice(0, 8), err instanceof Error ? err.message : "errore");
    }
  }
  return res;
}
