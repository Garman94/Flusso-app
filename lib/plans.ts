export type Plan = "free" | "premium" | "founder";

export function isPremium(plan: string): boolean {
  return plan === "premium" || plan === "founder";
}

export function isFounder(plan: string): boolean {
  return plan === "founder";
}

export function getPlanLabel(plan: string): string {
  switch (plan) {
    case "founder":
      return "Founder";
    case "premium":
      return "Premium";
    case "free":
    default:
      return "Gratuito";
  }
}

export function getPlanBadgeColor(plan: string): string {
  switch (plan) {
    case "founder":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "premium":
      return "bg-purple-100 text-purple-800 border-purple-300";
    case "free":
    default:
      return "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-500";
  }
}

/**
 * Piano effettivo: un utente Gratuito con la prova ancora attiva conta come Premium.
 * `trial_ends_at` viene scritta solo dal server (vedi migration 036 e startTrialIfNeeded).
 */
export function resolvePlan(plan: string, trialEndsAt?: string | null, now: Date = new Date()): string {
  if (plan === "free" && trialEndsAt && new Date(trialEndsAt).getTime() > now.getTime()) return "premium";
  return plan;
}

/** Giorni interi rimasti di prova (arrotondati per eccesso), 0 se scaduta o assente. */
export function trialDaysLeft(trialEndsAt?: string | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}
