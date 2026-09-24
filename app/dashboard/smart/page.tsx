import { toISODate } from "@/lib/dates";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/preview-plan";
import { SmartPageClient } from "./smart-page-client";
import type { RecurringExpense as SmartRecurringExpense } from "./smart-page-client";
import { currentPeriod } from "@/lib/period";

async function SmartContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const userId = data.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  const plan = await getEffectivePlan(profile?.plan ?? "free", profile?.trial_ends_at);

  // trial_ends_at valorizzata + piano ancora free = prova terminata (cambia solo il testo del blocco)
  const trialExpired = plan === "free" && !!profile?.trial_ends_at;

  // Bound esplicito a 1 anno: senza filtro data si rischia il limite di default di 1000
  // righe di Supabase, che senza un ordinamento esplicito puo' tagliare fuori dati recenti.
  // Copre anche i 12 mesi di storico usati dal tab Budget per categoria. Le voci "Media
  // storica" (bollette stagionali) usano query mirate per parola chiave, quindi non
  // dipendono da questa finestra.
  const transactionsFrom = toISODate(new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1));

  const [goalsRes, transactionsRes, categoriesRes, recurringRes, potsRes, contribRes, categoryBudgetsRes, budgetNotesRes] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("transactions").select("id, date, amount, category_id, description, merchant").eq("user_id", userId).gte("date", transactionsFrom).order("date", { ascending: false }),
    supabase.from("categories").select("id, name, color, icon").or(`user_id.eq.${userId},user_id.is.null`).order("name"),
    supabase.from("recurring_expenses").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase.from("savings_pots").select("id, name, emoji, current_balance").eq("user_id", userId).order("created_at"),
    supabase.from("goal_contributions").select("id, goal_id, amount, note, date").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("category_budgets").select("category_id, monthly_budget").eq("user_id", userId),
    supabase.from("category_budget_notes").select("category_id, year, month, note").eq("user_id", userId),
  ]);

  const payDay: number = profile?.pay_day ?? 0;
  const { from: periodFrom, to: periodTo, year: periodYear, month: periodMonth } = currentPeriod(payDay);

  return (
    <SmartPageClient
      userId={userId}
      plan={plan}
      trialExpired={trialExpired}
      initialGoals={goalsRes.data ?? []}
      transactions={transactionsRes.data ?? []}
      categories={categoriesRes.data ?? []}
      initialRecurring={(recurringRes.data ?? []) as unknown as SmartRecurringExpense[]}
      initialPots={potsRes.data ?? []}
      initialContributions={contribRes.data ?? []}
      piggyBalance={Number(profile?.piggy_balance ?? 0)}
      initialCategoryBudgets={categoryBudgetsRes.data ?? []}
      initialBudgetNotes={budgetNotesRes.data ?? []}
      payDay={payDay}
      periodFrom={periodFrom}
      periodTo={periodTo}
      periodYear={periodYear}
      periodMonth={periodMonth}
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
