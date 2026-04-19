"use client";

import { useState } from "react";
import { SmartClient } from "../transazioni/smart-client";
import { ObiettiviClient } from "../obiettivi/obiettivi-client";
import { BudgetClient } from "./recurring-client";

type Category = { id: string; name: string; color: string; icon: string };
type Transaction = { date: string; amount: number; category_id?: string | null; description?: string | null; merchant?: string | null };
type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  created_at: string;
};

type Props = {
  userId: string;
  plan: string;
  initialGoals: Goal[];
  transactions: Transaction[];
  categories: Category[];
};

type Tab = "previsioni" | "budget" | "obiettivi";

export function SmartPageClient({ userId, plan, initialGoals, transactions, categories }: Props) {
  const [tab, setTab] = useState<Tab>("previsioni");

  return (
    <div className="flex flex-col gap-6">

      {/* Header con tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setTab("previsioni")}
          className={`text-2xl font-bold transition-colors ${tab === "previsioni" ? "text-foreground" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`}
        >
          Previsioni
        </button>
        <span className="text-muted-foreground/20 text-2xl font-light select-none">/</span>
        <button
          onClick={() => setTab("budget")}
          className={`text-2xl font-bold transition-colors ${tab === "budget" ? "text-foreground" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`}
        >
          Budget
        </button>
        <span className="text-muted-foreground/20 text-2xl font-light select-none">/</span>
        <button
          onClick={() => setTab("obiettivi")}
          className={`text-2xl font-bold transition-colors ${tab === "obiettivi" ? "text-foreground" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`}
        >
          Obiettivi
        </button>
      </div>

      {/* Contenuto tab */}
      {tab === "previsioni" && (
        <SmartClient userId={userId} categories={categories} transactions={transactions} />
      )}
      {tab === "budget" && (
        <BudgetClient userId={userId} categories={categories} transactions={transactions} />
      )}
      {tab === "obiettivi" && (
        <ObiettiviClient userId={userId} plan={plan} initialGoals={initialGoals} />
      )}
    </div>
  );
}
