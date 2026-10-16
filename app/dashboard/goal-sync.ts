import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dopo un movimento in un salvadanaio: gli obiettivi collegati che erano allineati al saldo
 * di prima seguono il saldo nuovo. È la stessa regola del trigger sync_goal_from_pot
 * (migration 042), ripetuta qui così vale anche prima che la migration sia applicata; con il
 * trigger attivo non fa niente (l'obiettivo è già aggiornato e non è più uguale al saldo di prima).
 */
export async function syncGoalsWithPot(
  supabase: SupabaseClient, userId: string, potId: string, oldBalance: number, newBalance: number,
) {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (round(oldBalance) === round(newBalance)) return;
  await supabase.from("goals")
    .update({ current_amount: round(newBalance) })
    .eq("user_id", userId).eq("savings_pot_id", potId).eq("current_amount", round(oldBalance));
}
