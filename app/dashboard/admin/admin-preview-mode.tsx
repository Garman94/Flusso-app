"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPreviewPlan, clearPreviewPlan } from "@/app/actions/preview-plan";
import { getPlanLabel } from "@/lib/plans";

const PLANS = ["free", "premium", "founder"] as const;

export function AdminPreviewMode({ activePlan }: { activePlan: string | null }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleActivate(plan: string) {
    startTransition(async () => {
      await setPreviewPlan(plan);
      router.refresh();
    });
  }

  function handleDeactivate() {
    startTransition(async () => {
      await clearPreviewPlan();
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Modalità anteprima</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Naviga l&apos;app come se fossi un utente con un piano diverso dal tuo. Il tuo piano reale non viene modificato.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {PLANS.map((p) => (
          <button
            key={p}
            onClick={() => handleActivate(p)}
            disabled={isPending}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              activePlan === p
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-background hover:bg-muted border-border"
            }`}
          >
            {getPlanLabel(p)}
          </button>
        ))}

        {activePlan && (
          <button
            onClick={handleDeactivate}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-dashed border-muted-foreground text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
          >
            Disattiva anteprima
          </button>
        )}
      </div>

      {activePlan && (
        <p className="text-xs text-orange-600 dark:text-orange-400">
          Anteprima attiva: {getPlanLabel(activePlan)}. Un banner arancione è visibile in cima al dashboard.
        </p>
      )}
    </div>
  );
}
