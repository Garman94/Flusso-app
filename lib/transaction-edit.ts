// Pannello per modificare un movimento (Transazioni → tocco su una riga): funzioni pure.
// Test in tests/modifica-movimento.test.ts.

import { normalizeText } from "./categorize";
import { parseAmount } from "./import-parse";
import { TRANSFER_CATEGORY_NAMES } from "./money";

// ── Nomi delle categorie come si mostrano ───────────────────────────────────

/** Come si mostra la categoria "Spostamenti" (nel database il nome resta quello: lo usa la logica). */
export const TRANSFER_LABEL = "Giroconti e spostamenti";

/** Nome visibile di una categoria: "Spostamenti" diventa "Giroconti e spostamenti", le altre restano. */
export function categoryLabel(name: string | null | undefined): string {
  if (!name) return "";
  return normalizeText(name) === "spostamenti" ? TRANSFER_LABEL : name;
}

/** Categoria di giroconto (Spostamenti, Salvadanaio): non conta né nelle entrate né nelle uscite. */
export function isTransferName(name: string | null | undefined): boolean {
  return !!name && TRANSFER_CATEGORY_NAMES.has(normalizeText(name));
}

// ── Le categorie più usate ──────────────────────────────────────────────────

export type CategoryLite = { id: string; name: string };
export type UsageTx = { category_id: string | null; amount: number };

/** Per chi non ha ancora movimenti con categoria: le scelte più probabili, se esistono. */
const FALLBACK_EXPENSE = ["alimentari", "ristoranti", "trasporti", "casa", "bollette", "shopping"];
const FALLBACK_INCOME = ["stipendio", "bonifici", "rimborsi", "regali", "entrate", "spostamenti"];

/**
 * Le `n` categorie che l'utente usa di più per i movimenti dello stesso segno (uscite o entrate),
 * a parità di uso in ordine di nome. Se non bastano si aggiungono quelle usate con l'altro segno,
 * poi le più probabili per chi comincia. Solo categorie presenti in `categories`.
 */
export function topCategories<C extends CategoryLite>(
  txs: UsageTx[],
  categories: C[],
  opts: { n?: number; sign?: 1 | -1 } = {},
): C[] {
  const n = opts.n ?? 6;
  const byId = new Map(categories.map(c => [c.id, c]));
  const count = (pick: (t: UsageTx) => boolean) => {
    const m = new Map<string, number>();
    for (const t of txs) if (t.category_id && byId.has(t.category_id) && pick(t)) m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1);
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || byId.get(a[0])!.name.localeCompare(byId.get(b[0])!.name, "it"))
      .map(([id]) => byId.get(id)!);
  };

  const out: C[] = [];
  const add = (list: C[]) => { for (const c of list) if (out.length < n && !out.includes(c)) out.push(c); };
  const sign = opts.sign;
  if (sign) add(count(t => Math.sign(Number(t.amount)) === sign));
  add(count(() => true));
  const fallback = sign === 1 ? FALLBACK_INCOME : FALLBACK_EXPENSE;
  add(fallback.map(name => categories.find(c => normalizeText(c.name) === name)).filter((c): c is C => !!c));
  return out;
}

// ── Importo scritto a mano ───────────────────────────────────────────────────

/** Importo scritto nel pannello ("12,50", "1.234,56", "€ 8"): sempre positivo, il segno lo dà Entrata/Uscita. */
export function parseEditAmount(raw: string): number | null {
  const n = parseAmount(raw);
  if (n === null || !Number.isFinite(n)) return null;
  const abs = Math.round(Math.abs(n) * 100) / 100;
  return abs > 0 ? abs : null;
}

// ── Campi cambiati ──────────────────────────────────────────────────────────

export const EDITABLE_FIELDS = ["category_id", "amount", "date", "description", "member_id", "account_id", "notes"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type EditableTx = {
  category_id: string | null;
  amount: number;
  date: string;
  description: string | null;
  member_id: string | null;
  account_id: string | null;
  notes: string | null;
};

const norm = (field: EditableField, v: unknown): string | number | null => {
  if (field === "amount") return Math.round(Number(v) * 100) / 100;
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Quali campi sono cambiati (per salvare solo quelli e per l'evento transaction_edited: mai i valori). */
export function changedFields(before: EditableTx, after: EditableTx): EditableField[] {
  return EDITABLE_FIELDS.filter(f => norm(f, before[f]) !== norm(f, after[f]));
}

// ── Effetto sul saldo dei conti ─────────────────────────────────────────────

export type AnchorAccount = { id: string; name: string; anchor_date?: string | null };
export type BalanceImpact = { accountId: string; name: string; delta: number };

type MovedTx = Pick<EditableTx, "amount" | "date" | "account_id">;

/** Quanto pesa il movimento sul saldo di oggi del conto (lib/accounts.ts → balanceAt). */
function weight(t: MovedTx, a: AnchorAccount, today: string): number {
  if (t.account_id !== a.id || t.date > today) return 0;
  // Fino al giorno dell'ancora il movimento era già nel saldo letto in banca: non lo cambia.
  if (a.anchor_date && t.date <= a.anchor_date) return 0;
  return Number(t.amount);
}

/**
 * Come cambia il saldo di oggi di ogni conto con la modifica. Solo i conti che cambiano.
 * I movimenti con data fino all'ancora (il saldo controllato con la banca) non lo cambiano.
 */
export function accountBalanceImpact(before: MovedTx, after: MovedTx, accounts: AnchorAccount[], today: string): BalanceImpact[] {
  const out: BalanceImpact[] = [];
  for (const a of accounts) {
    const delta = Math.round((weight(after, a, today) - weight(before, a, today)) * 100) / 100;
    if (Math.abs(delta) >= 0.01) out.push({ accountId: a.id, name: a.name, delta });
  }
  return out;
}

/**
 * Il movimento cambia (importo, data o conto) ma è del giorno dell'ancora o prima:
 * il saldo del conto, già controllato con la banca, resta com'era. Restituisce il conto.
 */
export function beforeAnchor(before: MovedTx, after: MovedTx, accounts: AnchorAccount[]): AnchorAccount | null {
  const moved = norm("amount", before.amount) !== norm("amount", after.amount)
    || before.date !== after.date || before.account_id !== after.account_id;
  if (!moved || !after.account_id) return null;
  const a = accounts.find(x => x.id === after.account_id);
  return a?.anchor_date && after.date <= a.anchor_date ? a : null;
}
