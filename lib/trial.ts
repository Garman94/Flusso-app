import { TRIAL_DAYS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";

type ProfileLike = { plan?: string | null; trial_ends_at?: string | null } | null | undefined;

/**
 * Avvia (una sola volta) i giorni di Premium inclusi per un utente Gratuito.
 * Ritorna la fine della prova, o null se non applicabile.
 *
 * - Scrive col service role: `trial_ends_at` è protetta da trigger (migration 036).
 * - Se la migration non è ancora applicata la colonna non compare nel profilo
 *   (select "*"): in quel caso non fa nulla e l'app resta com'era.
 * - Non parte per Premium/Founder né per chi ha già usato la prova.
 */
export async function startTrialIfNeeded(profile: ProfileLike, userId: string): Promise<string | null> {
  if (!profile || !("trial_ends_at" in profile)) return null;
  if ((profile.plan ?? "free") !== "free") return profile.trial_ends_at ?? null;
  if (profile.trial_ends_at) return profile.trial_ends_at;

  try {
    const endsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
    const { error } = await createServiceClient()
      .from("profiles")
      .update({ trial_ends_at: endsAt })
      .eq("id", userId)
      .is("trial_ends_at", null);
    return error ? null : endsAt;
  } catch {
    return null;
  }
}
