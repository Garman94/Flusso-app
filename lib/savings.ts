// ============================================================
// Salvadanai multipli — tipi e helper puri.
// ============================================================

export type SavingsPot = {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  target_amount: number | null;
  current_balance: number;
  is_shared: boolean;
  color: string;
  created_at?: string;
};

export type SavingsPotMember = {
  id: string;
  pot_id: string;
  member_id: string | null;
  contributed_amount: number;
};

export type SavingsTransaction = {
  id: string;
  pot_id: string;
  member_id: string | null;
  amount: number;
  type: "deposit" | "withdraw";
  note: string | null;
  date: string;
  created_at: string;
};

export const POT_SUGGESTIONS: { emoji: string; name: string }[] = [
  { emoji: "🏖️", name: "Vacanza" },
  { emoji: "🛡️", name: "Emergenza" },
  { emoji: "🏠", name: "Casa" },
  { emoji: "🚗", name: "Auto" },
  { emoji: "🎓", name: "Studio" },
  { emoji: "💻", name: "Tech" },
];

export const POT_EMOJIS = ["🐷", "🏖️", "🛡️", "🏠", "🚗", "🎓", "💻", "✈️", "💍", "🎁", "🏥", "🐶", "🌱", "⚽"];

/** Percentuale di completamento verso il target (0-100), null se nessun target. */
export function potProgress(pot: Pick<SavingsPot, "target_amount" | "current_balance">): number | null {
  if (!pot.target_amount || pot.target_amount <= 0) return null;
  return Math.min(100, Math.max(0, (Number(pot.current_balance) / Number(pot.target_amount)) * 100));
}

export function potsTotal(pots: Pick<SavingsPot, "current_balance">[]): number {
  return pots.reduce((s, p) => s + Number(p.current_balance), 0);
}
