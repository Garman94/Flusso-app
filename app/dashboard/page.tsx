import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/preview-plan";
import { currentPeriod } from "@/lib/period";
import { addDaysISO, todayISO } from "@/lib/dates";
import { periodContaining, periodName, totals, type RecapTx } from "@/lib/recap";
import type { RecapTeaser } from "./recap-banner";
import { DashboardClient } from "./dashboard-client";
import type { Transaction, Goal, IncomeInfo } from "@/lib/calculations";
import { withPotBalances } from "@/lib/goals";
import { loadHeroBase, loadStartingBalance, type HeroData, type HeroProfile, type HeroTx } from "./hero-data";

// ─── Server component ─────────────────────────────────────────────────────────

/** Giorni dall'inizio del periodo in cui la dashboard invita al riepilogo di quello chiuso. */
const RECAP_BANNER_DAYS = 10;
/** Il periodo chiuso sembra completo se l'ultimo movimento è entro questi giorni dalla fine. */
const RECAP_COMPLETE_DAYS = 5;

async function DashboardContent() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) redirect("/auth/login");

  const userId = authData.claims.sub;

  // Primo giro: il profilo (per il giorno di paga) insieme a tutto quello che non dipende dal periodo.
  const [profileRes, heroBase, goalsRes, totalCountRes, lastTxRes, uncategorizedCountRes, goalPotsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    loadHeroBase(supabase, userId),
    supabase.from("goals")
      .select("id, name, target_amount, current_amount, deadline, icon, monthly_contribution, savings_pot_id")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
    supabase.from("transactions")
      .select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("transactions")
      .select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1).single(),
    supabase.from("transactions")
      .select("id", { count: "exact", head: true }).eq("user_id", userId).is("category_id", null),
    // un obiettivo collegato vale il saldo del suo salvadanaio (lib/goals.ts)
    supabase.from("savings_pots").select("id, current_balance").eq("user_id", userId),
  ]);

  const profile = profileRes.data as (HeroProfile & Record<string, unknown>) | null;
  const payDay: number = (profile?.pay_day as number | undefined) ?? 0;
  // Stesso periodo di Transazioni e Pianifica (lib/period.ts è l'unica fonte).
  const { from: mFrom, to: mTo } = currentPeriod(payDay);

  // Riepilogo del periodo appena chiuso, solo nei primi giorni del nuovo.
  const closed = todayISO() < addDaysISO(mFrom, RECAP_BANNER_DAYS)
    ? periodContaining(payDay, addDaysISO(mFrom, -1))
    : null;
  const closedTxsQuery = closed
    ? supabase.from("transactions").select("date, amount, categories(name)")
        .eq("user_id", userId).gte("date", closed.from).lte("date", closed.to)
    : null;

  // Secondo giro: i movimenti del periodo (una sola query per la card del saldo e per il resto
  // della pagina) e il saldo a inizio periodo.
  const [currentTxsRes, closedTxsRes, heroStart] = await Promise.all([
    supabase.from("transactions")
      .select("*, categories(name, color, icon)")
      .eq("user_id", userId).gte("date", mFrom).lte("date", mTo).order("date", { ascending: true }),
    closedTxsQuery,
    loadStartingBalance(supabase, userId, profile, heroBase.accounts, mFrom),
  ]);

  const hero: HeroData = {
    ...heroBase,
    ...heroStart,
    ownerIncome: (profile ?? null) as Partial<IncomeInfo> | null,
  };

  const closedTxs = (closedTxsRes?.data ?? []) as unknown as RecapTx[];
  const recapTeaser: RecapTeaser | null = closed && closedTxs.length >= 3
    ? {
        from: closed.from,
        month: periodName(payDay, closed).month,
        saved: totals(closedTxs).saved,
        complete: closedTxs.some(t => t.date >= addDaysISO(closed.to, -RECAP_COMPLETE_DAYS)),
      }
    : null;

  return (
    <DashboardClient
      userId={userId}
      profile={{
        full_name: (profile?.full_name as string | null | undefined) ?? null,
        plan: await getEffectivePlan((profile?.plan as string | undefined) ?? "free", profile?.trial_ends_at as string | null | undefined),
        piggy_balance: Number(profile?.piggy_balance ?? 0),
      }}
      currentTxs={(currentTxsRes.data ?? []) as unknown as (Transaction & HeroTx)[]}
      hero={hero}
      goals={withPotBalances((goalsRes.data ?? []) as unknown as (Goal & { monthly_contribution: number | null; savings_pot_id: string | null })[], goalPotsRes.data ?? [])}
      totalTxCount={totalCountRes.count ?? 0}
      uncategorizedCount={uncategorizedCountRes.count ?? 0}
      lastTxDate={lastTxRes.data?.date ?? null}
      payDay={payDay}
      periodFrom={mFrom}
      periodTo={mTo}
      recapTeaser={recapTeaser}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="rounded-xl border p-8 h-44 bg-muted/30" />
      <div className="rounded-xl border h-52 bg-muted/30" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border h-64 bg-muted/30" />
        <div className="rounded-xl border h-64 bg-muted/30" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
