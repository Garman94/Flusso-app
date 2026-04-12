import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";
import type { Transaction, Goal } from "@/lib/calculations";

function currentMonthRange() {
  const now = new Date();
  return {
    from:  new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0],
    to:    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0],
    year:  now.getFullYear(),
    month: now.getMonth(),
  };
}

function prevMonthRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0],
    to:   new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0],
  };
}

async function DashboardContent() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) redirect("/auth/login");

  const userId = authData.claims.sub;
  const { from: mFrom, to: mTo, year, month } = currentMonthRange();
  const { from: pFrom, to: pTo } = prevMonthRange();

  const [profileRes, currentTxsRes, prevTxsRes, goalsRes, totalCountRes, lastTxRes] = await Promise.all([
    supabase.from("profiles").select("full_name, plan, balance").eq("id", userId).single(),
    supabase.from("transactions")
      .select("id, amount, date, description, category_id, categories(name, color, icon)")
      .eq("user_id", userId).gte("date", mFrom).lte("date", mTo).order("date", { ascending: true }),
    supabase.from("transactions")
      .select("amount").eq("user_id", userId).gte("date", pFrom).lte("date", pTo),
    supabase.from("goals")
      .select("id, name, target_amount, current_amount, deadline, icon")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
    supabase.from("transactions")
      .select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("transactions")
      .select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1).single(),
  ]);

  return (
    <DashboardClient
      profile={{ full_name: profileRes.data?.full_name ?? null, plan: profileRes.data?.plan ?? "free", balance: Number(profileRes.data?.balance ?? 0) }}
      currentTxs={(currentTxsRes.data ?? []) as unknown as Transaction[]}
      prevTxsAmounts={(prevTxsRes.data ?? []).map(t => Number(t.amount))}
      goals={(goalsRes.data ?? []) as unknown as Goal[]}
      year={year}
      month={month}
      totalTxCount={totalCountRes.count ?? 0}
      lastTxDate={lastTxRes.data?.date ?? null}
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
