// Come conta un movimento nelle entrate e nelle uscite (non nel saldo: il saldo li vede tutti,
// perché i soldi sul conto si muovono davvero). Tre regole:
//
// 1. Giroconti (categorie Spostamenti e Salvadanaio, e i soldi che si passano i componenti
//    della famiglia): né entrate né uscite. I soldi restano "nostri".
// 2. Rimborsi: un movimento in entrata in una categoria di spesa (gli amici che ti ridanno la
//    loro parte della cena, un reso, il prelievo dal salvadanaio per pagare l'assicurazione)
//    abbassa la spesa di quella categoria invece di essere un'entrata.
// 3. Accantonamenti: il versamento è la spesa ("li ho già spesi"); quando li riprendi per pagare,
//    il prelievo (regola 2) compensa il pagamento: nei totali resta quello che hai messo da parte.
//
// Entrate e uscite cambiano, il risparmio no: entrate − uscite è sempre la somma dei movimenti
// che non sono giroconti.

import { normalizeText } from "./categorize";

/** Giroconti: soldi spostati tra conto, salvadanaio e altri conti, non guadagnati né spesi. */
export const TRANSFER_CATEGORY_NAMES = new Set(["spostamenti", "salvadanaio"]);

/** Categorie di entrata: qui un movimento positivo è un'entrata vera, uno negativo la riduce. */
export const INCOME_CATEGORY_NAMES = new Set([
  "stipendio", "bonifici", "entrate", "pensione", "rimborsi", "regali", "vendite", "interessi", "dividendi",
]);

export type MoneyTx = { amount: number; categories?: { name?: string | null } | null };
export type MoneyKind = "transfer" | "income" | "expense";

/** Tipo della categoria; null = movimento senza categoria (conta dal segno). */
export function categoryKind(name?: string | null): MoneyKind | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (TRANSFER_CATEGORY_NAMES.has(n)) return "transfer";
  return INCOME_CATEGORY_NAMES.has(n) ? "income" : "expense";
}

/** Quanto il movimento aggiunge alle entrate e alle uscite (entrambi possono essere negativi). */
export function flowOf(t: MoneyTx): { income: number; expense: number } {
  const a = Number(t.amount);
  switch (categoryKind(t.categories?.name)) {
    case "transfer": return { income: 0, expense: 0 };
    case "income": return { income: a, expense: 0 };      // uno storno riduce le entrate
    case "expense": return { income: 0, expense: -a };    // un rimborso riduce la spesa
    default: return a > 0 ? { income: a, expense: 0 } : { income: 0, expense: -a };
  }
}

/** true se il movimento conta nelle uscite (spesa o rimborso di una spesa). */
export function isSpending(t: MoneyTx): boolean {
  const kind = categoryKind(t.categories?.name);
  return kind === "expense" || (kind === null && Number(t.amount) < 0);
}

/** true se è un rimborso: in entrata ma in una categoria di spesa. */
export function isRefund(t: MoneyTx): boolean {
  return Number(t.amount) > 0 && categoryKind(t.categories?.name) === "expense";
}

export function moneyTotals(txs: MoneyTx[]): { income: number; expenses: number; saved: number } {
  let income = 0, expenses = 0;
  for (const t of txs) {
    const f = flowOf(t);
    income += f.income;
    expenses += f.expense;
  }
  return { income, expenses, saved: income - expenses };
}

/** Spesa netta per categoria (spese meno rimborsi), chiave = category_id o "__none__". */
export function spendingByCategory<T extends MoneyTx & { category_id?: string | null }>(txs: T[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of txs) {
    if (!isSpending(t)) continue;
    const key = t.category_id ?? "__none__";
    out.set(key, (out.get(key) ?? 0) - Number(t.amount));
  }
  return out;
}

// ── Soldi tra i componenti della famiglia ───────────────────────────────────

/** Parole che dicono che il movimento è un passaggio di soldi da o verso una persona. */
const TRANSFER_WORDS = /\b(bonifico|bonif|giroconto|trasferimento|ricarica|satispay|paypal|postepay|disposto|favore|accredito)\b/;

/**
 * Movimenti che sembrano passaggi di soldi con un componente della famiglia (non il titolare):
 * il nome del componente come parola intera, più una parola da bonifico o giroconto
 * ("BONIFICO ISTANTANEO DISPOSTO DA GANGEMI SAMIRA"). Esclusi quelli già tra i giroconti.
 */
export function familyTransferCandidates<T extends MoneyTx & { description?: string | null }>(
  txs: T[],
  members: { name: string; is_owner?: boolean | null }[],
): { member: string; txs: T[] }[] {
  const names = members
    .filter(m => !m.is_owner)
    .map(m => ({ member: m.name, word: normalizeText(m.name).split(" ")[0] }))
    .filter(m => m.word.length >= 3);
  const out: { member: string; txs: T[] }[] = [];
  for (const { member, word } of names) {
    const found = txs.filter(t => {
      if (categoryKind(t.categories?.name) === "transfer") return false;
      const text = ` ${normalizeText(t.description ?? "")} `;
      return text.includes(` ${word} `) && TRANSFER_WORDS.test(text);
    });
    if (found.length) out.push({ member, txs: found });
  }
  return out;
}
