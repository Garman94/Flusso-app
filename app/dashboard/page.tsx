import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/preview-plan";
import { DashboardClient } from "./dashboard-client";
import type { Transaction, Goal } from "@/lib/calculations";

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Saturday → Friday, Sunday → Monday, otherwise unchanged */
function adjustBizDay(date: Date): Date {
  const dow = date.getDay();
  if (dow === 6) return new Date(date.getTime() - 86_400_000); // Sat → Fri
  if (dow === 0) return new Date(date.getTime() + 86_400_000); // Sun → Mon
  return date;
}

function fmt(d: Date) {
  return d.toISOString().split("T")[0];
}

/**
 * Returns the current period range based on payDay.
 *   payDay = 0  → standard calendar month
 *   payDay 1–28 → pay-period starting on that day (adjusted for weekends)
 */
function getDateRanges(payDay: number) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed

  // Previous calendar month (always used for trend comparison)
  const prevFrom = fmt(new Date(y, m - 1, 1));
  const prevTo   = fmt(new Date(y, m, 0));

  if (payDay === 0) {
    return {
      from: fmt(new Date(y, m, 1)),
      to:   fmt(new Date(y, m + 1, 0)),
      year: y,
      month: m,
      prevFrom,
      prevTo,
    };
  }

  // Custom pay period
  let start = adjustBizDay(new Date(y, m, payDay));
  // If today is before this month's adjusted pay day, roll back one month
  if (today < start) {
    start = adjustBizDay(new Date(y, m - 1, payDay));
  }

  // Next period start = same payDay next month (adjusted)
  const nextStart = adjustBizDay(
    new Date(start.getFullYear(), start.getMonth() + 1, payDay)
  );
  // Period end = day before next start
  const end = new Date(nextStart.getTime() - 86_400_000);

  return {
    from:  fmt(start),
    to:    fmt(end),
    year:  start.getFullYear(),
    month: start.getMonth(),
    prevFrom,
    prevTo,
  };
}

// ─── Server component ─────────────────────────────────────────────────────────

async function DashboardContent() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) redirect("/auth/login");

  const userId = authData.claims.sub;

  // Fetch profile first to know the payDay
  const profileRes = await supabase
    .from("profiles")
    .select("full_name, plan, balance, pay_day, piggy_balance")
    .eq("id", userId)
    .single();

  const payDay: number = profileRes.data?.pay_day ?? 0;
  const { from: mFrom, to: mTo, year, month, prevFrom, prevTo } = getDateRanges(payDay);

  const [currentTxsRes, prevTxsRes, goalsRes, totalCountRes, lastTxRes, uncategorizedCountRes] = await Promise.all([
    supabase.from("transactions")
      .select("id, amount, date, description, category_id, categories(name, color, icon)")
      .eq("user_id", userId).gte("date", mFrom).lte("date", mTo).order("date", { ascending: true }),
    supabase.from("transactions")
      .select("amount").eq("user_id", userId).gte("date", prevFrom).lte("date", prevTo),
    supabase.from("goals")
      .select("id, name, target_amount, current_amount, deadline, icon")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
    supabase.from("transactions")
      .select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("transactions")
      .select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1).single(),
    supabase.from("transactions")
      .select("id", { count: "exact", head: true }).eq("user_id", userId).is("category_id", null),
  ]);

  return (
    <DashboardClient
      userId={userId}
      profile={{
        full_name: profileRes.data?.full_name ?? null,
        plan: await getEffectivePlan(profileRes.data?.plan ?? "free"),
        balance: Number(profileRes.data?.balance ?? 0),
        piggy_balance: Number(profileRes.data?.piggy_balance ?? 0),
      }}
      currentTxs={(currentTxsRes.data ?? []) as unknown as Transaction[]}
      prevTxsAmounts={(prevTxsRes.data ?? []).map(t => Number(t.amount))}
      goals={(goalsRes.data ?? []) as unknown as Goal[]}
      year={year}
      month={month}
      totalTxCount={totalCountRes.count ?? 0}
      uncategorizedCount={uncategorizedCountRes.count ?? 0}
      lastTxDate={lastTxRes.data?.date ?? null}
      payDay={payDay}
      periodFrom={mFrom}
      periodTo={mTo}
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
