import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/preview-plan";
import { PageTour } from "@/components/tour/page-tour";
import { SmartPageClient } from "./smart-page-client";
import type { RecurringExpense as SmartRecurringExpense } from "./smart-page-client";
import { getCurrentPeriodAnchor, computePeriodRange } from "@/lib/period";

async function SmartContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const userId = data.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, pay_day, piggy_balance")
    .eq("id", userId)
    .single();

  const plan = await getEffectivePlan(profile?.plan ?? "free");

  if (plan === "free") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center max-w-md mx-auto">
        <Suspense><PageTour path="/dashboard/smart" plan="free" /></Suspense>
        <span className="text-6xl">🔒</span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Sezione Budget</h1>
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

  // Bound esplicito a 1 anno: senza filtro data si rischia il limite di default di 1000
  // righe di Supabase, che senza un ordinamento esplicito puo' tagliare fuori dati recenti.
  // Le voci "Media storica" (bollette stagionali) usano query mirate per parola chiave nel
  // pannello Spese variabili, quindi non dipendono da questa finestra.
  const transactionsFrom = new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1).toISOString().split("T")[0];

  const [goalsRes, transactionsRes, categoriesRes, recurringRes, potsRes, contribRes, variableCatsRes] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("transactions").select("date, amount, category_id, description, merchant").eq("user_id", userId).gte("date", transactionsFrom).order("date", { ascending: false }),
    supabase.from("categories").select("id, name, color, icon").or(`user_id.eq.${userId},user_id.is.null`).order("name"),
    supabase.from("recurring_expenses").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase.from("savings_pots").select("id, name, emoji, current_balance").eq("user_id", userId).order("created_at"),
    supabase.from("goal_contributions").select("id, goal_id, amount, note, date").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("variable_expense_categories").select("category_id").eq("user_id", userId),
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
      initialRecurring={(recurringRes.data ?? []) as unknown as SmartRecurringExpense[]}
      initialPots={potsRes.data ?? []}
      initialContributions={contribRes.data ?? []}
      piggyBalance={Number(profile?.piggy_balance ?? 0)}
      initialVariableCategoryIds={(variableCatsRes.data ?? []).map(r => r.category_id)}
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
