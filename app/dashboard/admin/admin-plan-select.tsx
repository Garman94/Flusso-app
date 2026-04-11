"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Plan } from "@/lib/plans";

const PLANS: Plan[] = ["free", "premium", "founder"];
const PLAN_LABELS: Record<Plan, string> = {
  free: "Gratuito",
  premium: "Premium",
  founder: "Founder",
};

export function AdminPlanSelect({
  userId,
  currentPlan,
}: {
  userId: string;
  currentPlan: string;
}) {
  const [plan, setPlan] = useState(currentPlan);
  const [loading, setLoading] = useState(false);

  async function handleChange(newPlan: Plan) {
    if (newPlan === plan) return;
    setLoading(true);

    try {
      const res = await fetch("/api/admin/update-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, plan: newPlan }),
      });

      if (!res.ok) throw new Error(await res.text());
      setPlan(newPlan);
      toast.success(`Piano aggiornato a ${PLAN_LABELS[newPlan]}`);
    } catch (err) {
      toast.error("Errore nell'aggiornamento del piano");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <select
      value={plan}
      onChange={(e) => handleChange(e.target.value as Plan)}
      disabled={loading}
      className="text-xs border rounded px-2 py-1 bg-background disabled:opacity-50 cursor-pointer"
    >
      {PLANS.map((p) => (
        <option key={p} value={p}>
          {PLAN_LABELS[p]}
        </option>
      ))}
    </select>
  );
}
