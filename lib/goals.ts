// Obiettivi e salvadanai: un obiettivo collegato a un salvadanaio non ha più un suo contatore.
// I soldi dell'obiettivo sono il saldo del salvadanaio: un versamento lo fa salire, un prelievo
// (anche dall'Emergenza) lo fa scendere. Prima i due numeri andavano ognuno per conto suo e gli
// stessi euro si contavano due volte.
//
// goals.current_amount resta: per gli obiettivi senza salvadanaio è il contatore di sempre; per
// quelli collegati il trigger della migration 042 lo tiene uguale al saldo. Se è diverso da prima
// dell'unione, l'utente sceglie quale numero è giusto (goalMismatch).

export type GoalLike = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  savings_pot_id: string | null;
};
export type PotLike = { id: string; current_balance: number };

const potOf = (g: Pick<GoalLike, "savings_pot_id">, pots: PotLike[]) =>
  g.savings_pot_id ? pots.find(p => p.id === g.savings_pot_id) ?? null : null;

/** Soldi da parte per l'obiettivo: il saldo del suo salvadanaio, altrimenti il suo contatore. */
export function goalSaved(g: Pick<GoalLike, "savings_pot_id" | "current_amount">, pots: PotLike[]): number {
  const pot = potOf(g, pots);
  return pot ? Number(pot.current_balance) : Number(g.current_amount);
}

export type GoalWithSaved<G> = G & {
  /** quello che conta: il saldo del salvadanaio se collegato */
  current_amount: number;
  /** il contatore salvato sull'obiettivo */
  recorded_amount: number;
  /** collegato a un salvadanaio che esiste */
  in_pot: boolean;
};

/** Gli obiettivi con `current_amount` preso dal salvadanaio: il resto del codice non cambia. */
export function withPotBalances<G extends Pick<GoalLike, "savings_pot_id" | "current_amount">>(
  goals: G[], pots: PotLike[],
): GoalWithSaved<G>[] {
  return goals.map(g => ({
    ...g,
    current_amount: goalSaved(g, pots),
    recorded_amount: Number(g.current_amount),
    in_pot: !!potOf(g, pots),
  }));
}

/** Obiettivo e salvadanaio segnano cifre diverse: va scelto quale è giusta. */
export function goalMismatch(
  g: Pick<GoalLike, "savings_pot_id" | "current_amount">, pots: PotLike[],
): { recorded: number; inPot: number } | null {
  const pot = potOf(g, pots);
  if (!pot) return null;
  const recorded = Number(g.current_amount), inPot = Number(pot.current_balance);
  return Math.abs(recorded - inPot) > 0.005 ? { recorded, inPot } : null;
}

export type PotChoice<P> = { pot: P; usedBy: string | null; sinking: boolean };

/**
 * Salvadanai che si possono collegare a un obiettivo: non quelli di un altro obiettivo (gli
 * stessi soldi conterebbero per due) né quelli che tengono gli accantonamenti.
 */
export function potChoicesForGoal<P extends { id: string }>(
  pots: P[],
  goals: Pick<GoalLike, "id" | "name" | "savings_pot_id">[],
  goalId: string | null,
  sinkingPotIds: (string | null | undefined)[],
): PotChoice<P>[] {
  const sinking = new Set(sinkingPotIds.filter((x): x is string => !!x));
  return pots.map(pot => ({
    pot,
    usedBy: goals.find(g => g.id !== goalId && g.savings_pot_id === pot.id)?.name ?? null,
    sinking: sinking.has(pot.id),
  }));
}
