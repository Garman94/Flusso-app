import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/preview-plan";
import { currentPeriod } from "@/lib/period";
import { addDaysISO, todayISO } from "@/lib/dates";
import { periodContaining, periodName, totals, type RecapTx } from "@/lib/recap";
import type { RecapTeaser } from "./recap-banner";
import { DashboardClient } from "./dashboard-client";
import type { Transaction, Goal } from "@/lib/calculations";

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

  // Fetch profile first to know the payDay
  const profileRes = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  const payDay: number = profileRes.data?.pay_day ?? 0;
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

  const [currentTxsRes, goalsRes, totalCountRes, lastTxRes, uncategorizedCountRes, closedTxsRes] = await Promise.all([
    supabase.from("transactions")
      .select("id, amount, date, description, category_id, categories(name, color, icon)")
      .eq("user_id", userId).gte("date", mFrom).lte("date", mTo).order("date", { ascending: true }),
    supabase.from("goals")
      .select("id, name, target_amount, current_amount, deadline, icon, monthly_contribution")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
    supabase.from("transactions")
      .select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("transactions")
      .select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1).single(),
    supabase.from("transactions")
      .select("id", { count: "exact", head: true }).eq("user_id", userId).is("category_id", null),
    closedTxsQuery,
  ]);

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
        full_name: profileRes.data?.full_name ?? null,
        plan: await getEffectivePlan(profileRes.data?.plan ?? "free", profileRes.data?.trial_ends_at),
        piggy_balance: Number(profileRes.data?.piggy_balance ?? 0),
      }}
      currentTxs={(currentTxsRes.data ?? []) as unknown as Transaction[]}
      goals={(goalsRes.data ?? []) as unknown as (Goal & { monthly_contribution: number | null })[]}
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
