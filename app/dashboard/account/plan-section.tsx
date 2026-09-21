"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPlanLabel, getPlanBadgeColor } from "@/lib/plans";
import { CouponForm } from "./coupon-form";
import { UpgradeButton } from "./upgrade-button";
import { CancelSubscriptionButton } from "./cancel-subscription-button";

interface Props {
  plan: string;
  userId: string;
  checkoutUrl: string | null;
  planLabel: string;
  planBadgeColor: string;
  hasSubscription: boolean;
  /** Giorni rimasti della prova Premium inclusa (0 = nessuna prova attiva) */
  trialDaysLeft?: number;
  /** Fine del periodo già pagato se l'abbonamento è stato annullato */
  premiumEndsAt?: string | null;
}

export function PlanSection({ plan: initialPlan, userId, checkoutUrl, planLabel: _planLabel, planBadgeColor: _planBadgeColor, hasSubscription, trialDaysLeft = 0, premiumEndsAt = null }: Props) {
  const [plan, setPlan] = useState(initialPlan);
  // Dopo l'annullamento il piano resta Premium fino a fine periodo (evento subscription_expired)
  const [cancelled, setCancelled] = useState<{ endsAt: string | null } | null>(
    premiumEndsAt && new Date(premiumEndsAt) > new Date() ? { endsAt: premiumEndsAt } : null,
  );
  const inTrial = trialDaysLeft > 0;

  const label = inTrial ? "Prova Premium" : getPlanLabel(plan);
  const badgeColor = getPlanBadgeColor(plan);
  const isFree = plan === "free" || inTrial;
  const endsLabel = cancelled?.endsAt
    ? new Date(cancelled.endsAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="rounded-xl border p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Piano di abbonamento</h2>
        <Badge className={cn("text-sm", badgeColor)}>{label}</Badge>
      </div>

      {isFree ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            {inTrial ? (
              <>
                Hai Premium incluso per altri <strong>{trialDaysLeft} {trialDaysLeft === 1 ? "giorno" : "giorni"}</strong>.
                Poi torni al piano Gratuito, a meno che tu non passi a Premium: i tuoi dati restano tutti qui.
              </>
            ) : (
              <>Sei sul piano gratuito. Fai l&apos;upgrade per sbloccare tutte le funzionalità.</>
            )}
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
            {cancelled ? (
              <>
                Abbonamento annullato: <strong>{label}</strong> resta attivo
                {endsLabel ? <> fino al <strong>{endsLabel}</strong></> : " fino alla fine del periodo già pagato"}, poi torni al piano Gratuito.
              </>
            ) : (
              <>Hai un abbonamento <strong>{label}</strong> attivo.</>
            )}
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
          {/* Founder is a one-time lifetime payment — no recurring subscription to cancel */}
          {plan === "premium" && hasSubscription && !cancelled && (
            <div className="flex flex-col gap-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Non vuoi più continuare?
              </p>
              <CancelSubscriptionButton onCancelled={(endsAt) => setCancelled({ endsAt })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
