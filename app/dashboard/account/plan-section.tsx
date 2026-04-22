"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPlanLabel, getPlanBadgeColor } from "@/lib/plans";
import { CouponForm } from "./coupon-form";
import { UpgradeButton } from "./upgrade-button";

interface Props {
  plan: string;
  userId: string;
  checkoutUrl: string | null;
  planLabel: string;
  planBadgeColor: string;
}

export function PlanSection({ plan: initialPlan, userId, checkoutUrl, planLabel, planBadgeColor }: Props) {
  const [plan, setPlan] = useState(initialPlan);

  const label = getPlanLabel(plan);
  const badgeColor = getPlanBadgeColor(plan);
  const isFree = plan === "free";

  return (
    <div className="rounded-xl border p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Piano di abbonamento</h2>
        <Badge className={cn("text-sm", badgeColor)}>{label}</Badge>
      </div>

      {isFree ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Sei sul piano gratuito. Fai l&apos;upgrade per sbloccare tutte le funzionalità.
          </p>

          {/* Payment upgrade */}
          {checkoutUrl && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Abbonamento</p>
              <UpgradeButton userId={userId} checkoutUrl={checkoutUrl} />
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">oppure</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Coupon */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Codice coupon</p>
            <CouponForm onUpgrade={setPlan} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Hai un abbonamento <strong>{label}</strong> attivo.
          </p>
          {/* Founder can't upgrade further; premium can use coupon to become founder */}
          {plan === "premium" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Hai un codice Founder?
              </p>
              <CouponForm onUpgrade={setPlan} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
