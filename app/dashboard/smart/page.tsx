import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SmartPageClient } from "./smart-page-client";
import { getCurrentPeriodAnchor, computePeriodRange } from "@/lib/period";

async function SmartContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const userId = data.claims.sub;

  const [profileRes, goalsRes, transactionsRes, categoriesRes] = await Promise.all([
    supabase.from("profiles").select("plan, pay_day").eq("id", userId).single(),
    supabase.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("transactions").select("date, amount, category_id, description, merchant").eq("user_id", userId),
    supabase.from("categories").select("id, name, color, icon").or(`user_id.eq.${userId},user_id.is.null`).order("name"),
  ]);

  const payDay: number = profileRes.data?.pay_day ?? 0;
  const anchor = getCurrentPeriodAnchor(payDay);
  const { from: periodFrom, to: periodTo } = computePeriodRange(payDay, anchor.year, anchor.month);

  return (
    <SmartPageClient
      userId={userId}
      plan={profileRes.data?.plan ?? "free"}
      initialGoals={goalsRes.data ?? []}
      transactions={transactionsRes.data ?? []}
      categories={categoriesRes.data ?? []}
      payDay={payDay}
      periodFrom={periodFrom}
      periodTo={periodTo}
      periodYear={anchor.year}
      periodMonth={anchor.month}
    />
  );
}

export default function SmartPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="rounded-xl border p-5 h-32 bg-muted/30" />
        <div className="rounded-xl border p-5 h-64 bg-muted/30" />
      </div>
    }>
      <SmartContent />
    </Suspense>
  );
}
