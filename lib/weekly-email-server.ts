// Invio dell'email del lunedì. Solo lato server: legge con la service role (senza RLS), quindi
// ogni query DEVE filtrare per user_id. I numeri sono quelli della dashboard: stesse query di
// app/dashboard/page.tsx (loadHeroBase, movimenti del periodo, loadStartingBalance) e stessi
// calcoli (lib/hero-numbers.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { siteConfig } from "./config";
import { todayISO } from "./dates";
import { currentPeriod } from "./period";
import { heroNumbers } from "./hero-numbers";
import { upcomingItems, type UpcomingItem } from "./upcoming";
import { weeklyEmail, WEEKLY_SOURCE, type WeeklyEmail } from "./weekly-email";
import { unsubscribeQuery } from "./email-token";
import { isAdminEmail } from "./admin-emails";
import { isDemoEmail } from "./demo";
import { mondayOf } from "./retention";
import { loadHeroBase, loadStartingBalance, type HeroProfile, type HeroTx } from "@/app/dashboard/hero-data";
import type { IncomeInfo } from "./calculations";

const FROM = process.env.RESEND_FROM_EMAIL ?? `noreply@${new URL(siteConfig.url).hostname}`;
/** Resend accetta 2 richieste al secondo: tra un'email e l'altra si aspetta un po'. */
const PAUSE_MS = 600;

type ProfileRow = HeroProfile & Partial<IncomeInfo> & {
  id: string;
  full_name?: string | null;
  pay_day?: number | null;
  piggy_balance?: number | string | null;
  email_weekly?: boolean | null;
};

function link(path: string, extra = ""): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${siteConfig.url}${path}${sep}da=${WEEKLY_SOURCE}${extra}`;
}

/** L'email di un utente, o null se non c'è niente da dire (nessun movimento mai caricato). */
export async function buildWeeklyEmail(service: SupabaseClient, profile: ProfileRow, now: Date = new Date()): Promise<WeeklyEmail | null> {
  const userId = profile.id;
  const payDay = profile.pay_day ?? 0;
  const today = todayISO(now);
  const { from, to } = currentPeriod(payDay, now);

  const [base, lastTxRes] = await Promise.all([
    loadHeroBase(service, userId),
    service.from("transactions").select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1),
  ]);
  const lastTxDate = (lastTxRes.data?.[0]?.date as string | undefined) ?? null;
  // Chi non ha mai caricato niente lo richiama il promemoria dopo lo stipendio (prossima PR).
  if (!lastTxDate) return null;

  const [txRes, start] = await Promise.all([
    service.from("transactions")
      .select("*, categories(name, color, icon)")
      .eq("user_id", userId).gte("date", from).lte("date", to).order("date", { ascending: true }),
    loadStartingBalance(service, userId, profile, base.accounts, from),
  ]);
  const periodTxs = (txRes.data ?? []) as unknown as HeroTx[];

  const hero = heroNumbers({
    startingBalance: start.startingBalance,
    items: base.items,
    periodTxs,
    budgetTotal: base.budgetTotal,
    ownerIncome: profile,
    membersIncome: base.membersIncome,
    piggyBalance: Number(profile.piggy_balance ?? 0),
    periodFrom: from,
    periodTo: to,
    today,
  });

  return weeklyEmail(
    {
      name: profile.full_name ?? null,
      today,
      payDay,
      periodTo: to,
      lastTxDate,
      spend: hero?.spend ?? null,
      committed: hero?.projection.committedRemaining ?? 0,
      upcoming: upcomingItems(base.items as unknown as UpcomingItem[], periodTxs, from, to, today),
    },
    {
      dashboard: link("/dashboard"),
      importFile: link("/dashboard/transazioni", "&import=1"),
      budget: link("/dashboard/smart", "&v=budget"),
      settings: link("/dashboard/account", "#avvisi"),
      unsubscribe: `${siteConfig.url}/disiscriviti?${unsubscribeQuery(userId, "weekly")}`,
    },
  );
}

export async function sendEmail(to: string, userId: string, email: WeeklyEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const { error } = await new Resend(apiKey).emails.send({
    from: FROM,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: {
      // disiscrizione con un clic dal programma di posta (Gmail, Apple Mail): RFC 8058
      "List-Unsubscribe": `<${siteConfig.url}/api/email/disiscriviti?${unsubscribeQuery(userId, "weekly")}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (error) throw new Error(`resend: ${error.name}`);
}

export type WeeklyRunResult = { sent: number; skipped: number; already: number; failed: number; variants: Record<string, number> };

/**
 * Il giro del lunedì: tutti gli utenti con l'email accesa, tranne admin e demo.
 * Per ognuno prima si scrive la riga in email_sends (utente, "weekly", lunedì della settimana):
 * se c'è già, l'email è già partita e si salta. Se l'invio fallisce la riga si toglie.
 */
export async function runWeeklyEmails(service: SupabaseClient, now: Date = new Date()): Promise<WeeklyRunResult> {
  const res: WeeklyRunResult = { sent: 0, skipped: 0, already: 0, failed: 0, variants: {} };
  const week = mondayOf(now);

  const emails = new Map<string, string>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) {
      const e = (u.email ?? "").toLowerCase();
      if (!e || isDemoEmail(e) || isAdminEmail(e) || !u.email_confirmed_at) continue;
      emails.set(u.id, u.email!);
    }
    if (data.users.length < 1000) break;
  }

  const { data: profiles, error } = await service.from("profiles").select("*").eq("email_weekly", true);
  if (error) throw new Error(`profiles: ${error.message}`);

  for (const p of (profiles ?? []) as ProfileRow[]) {
    const to = emails.get(p.id);
    if (!to) { res.skipped++; continue; }

    const claim = await service.from("email_sends")
      .insert({ user_id: p.id, kind: "weekly", period_key: week })
      .select("id").maybeSingle();
    if (claim.error) {
      if (claim.error.code === "23505") res.already++; // già mandata questa settimana
      else res.failed++;
      continue;
    }

    try {
      const email = await buildWeeklyEmail(service, p, now);
      if (!email) {
        await service.from("email_sends").delete().eq("id", claim.data!.id);
        res.skipped++;
        continue;
      }
      await sendEmail(to, p.id, email);
      res.sent++;
      res.variants[email.variant] = (res.variants[email.variant] ?? 0) + 1;
      await new Promise(r => setTimeout(r, PAUSE_MS));
    } catch (err) {
      await service.from("email_sends").delete().eq("id", claim.data!.id);
      res.failed++;
      // mai l'indirizzo o il contenuto nei log
      console.error("email del lunedì non partita", p.id.slice(0, 8), err instanceof Error ? err.message : "errore");
    }
  }
  return res;
}
