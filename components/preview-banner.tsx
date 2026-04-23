"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPreviewPlan, clearPreviewPlan } from "@/app/actions/preview-plan";
import { getPlanLabel } from "@/lib/plans";

const PLANS = ["free", "premium", "founder"] as const;

export function PreviewBanner({ currentPreview }: { currentPreview: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSwitch(plan: string) {
    startTransition(async () => {
      await setPreviewPlan(plan);
      router.refresh();
    });
  }

  function handleExit() {
    startTransition(async () => {
      await clearPreviewPlan();
      router.refresh();
    });
  }

  return (
    <div className="w-full bg-orange-500 text-white text-sm px-4 py-2 flex items-center justify-center gap-4 flex-wrap">
      <span className="font-semibold">
        Anteprima admin: piano {getPlanLabel(currentPreview)}
      </span>
      <div className="flex items-center gap-2">
        {PLANS.map((p) => (
          <button
            key={p}
            onClick={() => handleSwitch(p)}
            disabled={isPending || p === currentPreview}
            className="px-2 py-0.5 rounded text-xs font-medium bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-default transition-colors"
          >
            {getPlanLabel(p)}
          </button>
        ))}
        <button
          onClick={handleExit}
          disabled={isPending}
          className="px-2 py-0.5 rounded text-xs font-medium bg-white/40 hover:bg-white/60 transition-colors"
        >
          Esci
        </button>
      </div>
    </div>
  );
}
