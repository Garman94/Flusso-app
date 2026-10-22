// Conti (migration 048, pagina /dashboard/conti): il saldo di ogni conto e il controllo con la banca.
// Ogni conto ha un'ancora: il saldo letto in banca a fine giornata di anchor_date, movimenti di quel
// giorno compresi. Il saldo in un altro giorno è l'ancora più (o meno) i movimenti del conto in mezzo.
// I movimenti con data fino all'ancora caricati dopo non cambiano il saldo: erano già nel saldo della banca.
// Solo funzioni pure: test in tests/conti.test.ts.

import { addDaysISO } from "@/lib/dates";
import { normalizeText } from "@/lib/categorize";

export type Account = {
  id: string;
  name: string;
  member_id: string | null;
  anchor_balance: number;
  anchor_date: string;
  checked_at: string | null;
};

export type AccountTx = { date: string; amount: number; account_id: string | null; description?: string | null };

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (txs: AccountTx[]) => txs.reduce((s, t) => s + Number(t.amount), 0);

/** Saldo del conto a fine giornata `date`. */
export function balanceAt(a: Account, txs: AccountTx[], date: string): number {
  const own = txs.filter(t => t.account_id === a.id);
  if (date >= a.anchor_date) {
    return round2(Number(a.anchor_balance) + sum(own.filter(t => t.date > a.anchor_date && t.date <= date)));
  }
  return round2(Number(a.anchor_balance) - sum(own.filter(t => t.date > date && t.date <= a.anchor_date)));
}

/** Totale dei conti a inizio giornata `date` (= a fine del giorno prima): è il "saldo a inizio periodo". */
export function totalAtStartOf(accounts: Account[], txs: AccountTx[], date: string): number {
  const before = addDaysISO(date, -1);
  return round2(accounts.reduce((s, a) => s + balanceAt(a, txs, before), 0));
}

/** Date dei movimenti che servono per calcolare i saldi in `date`: tra le ancore e quel giorno. */
export function neededRange(accounts: Account[], date: string): { from: string; to: string } | null {
  if (!accounts.length) return null;
  const dates = [...accounts.map(a => a.anchor_date), date];
  return { from: dates.reduce((m, d) => (d < m ? d : m)), to: dates.reduce((m, d) => (d > m ? d : m)) };
}

export type Duplicate = { date: string; amount: number; description: string; count: number };

/** Movimenti uguali (stesso giorno, importo e descrizione) nello stesso conto: possibili doppioni. */
export function possibleDuplicates(a: Account, txs: AccountTx[], since: string): Duplicate[] {
  const groups = new Map<string, Duplicate>();
  for (const t of txs) {
    if (t.account_id !== a.id || t.date < since) continue;
    const description = t.description ?? "";
    const key = `${t.date}|${Number(t.amount).toFixed(2)}|${normalizeText(description)}`;
    const g = groups.get(key) ?? { date: t.date, amount: Number(t.amount), description, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].filter(g => g.count > 1).sort((x, y) => y.date.localeCompare(x.date));
}

export type Reconciliation = {
  flusso: number;
  bank: number;
  /** banca − Flusso: positivo = in banca c'è di più */
  diff: number;
  ok: boolean;
  lastMovement: string | null;
  daysSinceLast: number | null;
  duplicates: Duplicate[];
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

/** Confronto col saldo letto oggi nell'app della banca, con gli indizi per capire una differenza. */
export function reconcile(a: Account, txs: AccountTx[], bank: number, today: string): Reconciliation {
  const flusso = balanceAt(a, txs, today);
  const diff = round2(bank - flusso);
  const own = txs.filter(t => t.account_id === a.id && t.date <= today);
  const lastMovement = own.length ? own.reduce((m, t) => (t.date > m ? t.date : m), own[0].date) : null;
  return {
    flusso, bank: round2(bank), diff, ok: Math.abs(diff) < 0.01,
    lastMovement, daysSinceLast: lastMovement ? daysBetween(lastMovement, today) : null,
    duplicates: possibleDuplicates(a, txs, addDaysISO(today, -120)),
  };
}
