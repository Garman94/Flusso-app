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

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, pay_day")
    .eq("id", userId)
    .single();

  const plan = profile?.plan ?? "free";

  if (plan === "free") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center max-w-md mx-auto">
        <span className="text-6xl">🔒</span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Sezione Smart</h1>
          <p className="text-muted-foreground">
            Previsioni, spese ricorrenti e obiettivi di risparmio sono disponibili con il piano Premium o Founder.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <a
            href="/pricing"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Scopri Premium
          </a>
          <a
            href="/dashboard/account"
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Hai già un codice coupon? Riscattalo qui
          </a>
        </div>
      </div>
    );
  }

  const [goalsRes, transactionsRes, categoriesRes] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("transactions").select("date, amount, category_id, description, merchant").eq("user_id", userId),
    supabase.from("categories").select("id, name, color, icon").or(`user_id.eq.${userId},user_id.is.null`).order("name"),
  ]);

  const payDay: number = profile?.pay_day ?? 0;
  const anchor = getCurrentPeriodAnchor(payDay);
  const { from: periodFrom, to: periodTo } = computePeriodRange(payDay, anchor.year, anchor.month);

  return (
    <SmartPageClient
      userId={userId}
      plan={plan}
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
