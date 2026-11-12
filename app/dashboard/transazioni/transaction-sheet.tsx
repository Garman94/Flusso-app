"use client";

// Pannello per modificare un movimento: si apre toccando una riga in Transazioni.
// Dal basso sul telefono, al centro su computer. Calcoli in lib/transaction-edit.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useDemoGuard } from "@/components/demo-context";
import { todayISO } from "@/lib/dates";
import { track } from "@/lib/track";
import {
  accountBalanceImpact, beforeAnchor, categoryLabel, changedFields, isTransferName,
  parseEditAmount, topCategories, type EditableTx, type EditableField,
} from "@/lib/transaction-edit";
import { updateTransaction } from "./actions";
import type { Category, FamilyMember, Transaction } from "./transazioni-client";

export type SheetAccount = { id: string; name: string; member_id: string | null; anchor_date?: string | null };

type Props = {
  tx: Transaction;
  categories: Category[];
  /** tutti i movimenti caricati: servono per le categorie più usate */
  transactions: Pick<Transaction, "category_id" | "amount">[];
  familyMembers: FamilyMember[];
  accounts: SheetAccount[];
  onClose: () => void;
  onSaved: (updated: Transaction, changed: EditableField[]) => void;
  /** chiede conferma ed elimina; true se l'ha eliminato */
  onDelete: (id: string) => Promise<boolean>;
};

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
}

/** "12.5" → "12,50": come si scrive l'importo nel campo. */
function amountText(n: number) {
  return Math.abs(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

const fieldBase = "w-full border rounded-lg px-3 min-h-11 bg-background focus:outline-none focus:ring-2 focus:ring-primary";
// text-base sul telefono: sotto i 16px iOS ingrandisce la pagina quando si tocca il campo.
const field = `${fieldBase} text-base sm:text-sm`;

export function TransactionSheet({ tx, categories, transactions, familyMembers, accounts, onClose, onSaved, onDelete }: Props) {
  const demoGuard = useDemoGuard();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  const before: EditableTx = useMemo(() => ({
    category_id: tx.category_id,
    amount: Number(tx.amount),
    date: tx.date,
    description: tx.description,
    member_id: tx.member_id,
    account_id: tx.account_id ?? null,
    notes: tx.notes,
  }), [tx]);

  const [sign, setSign] = useState<1 | -1>(Number(tx.amount) >= 0 ? 1 : -1);
  const [amount, setAmount] = useState(amountText(Number(tx.amount)));
  const [categoryId, setCategoryId] = useState(tx.category_id ?? "");
  const [date, setDate] = useState(tx.date);
  const [description, setDescription] = useState(tx.description ?? "");
  const [memberId, setMemberId] = useState(tx.member_id ?? "");
  const [accountId, setAccountId] = useState(tx.account_id ?? "");
  const [notes, setNotes] = useState(tx.notes ?? "");

  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Con la conferma di eliminazione aperta, Esc chiude solo quella.
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [mounted]);

  const parsed = parseEditAmount(amount);
  const after: EditableTx = {
    category_id: categoryId || null,
    amount: parsed === null ? before.amount : sign * parsed,
    date: date || before.date,
    description,
    member_id: memberId || null,
    account_id: accountId || null,
    notes,
  };
  const changed = changedFields(before, after);

  const top = useMemo(() => topCategories(transactions, categories, { n: 6, sign }), [transactions, categories, sign]);
  const selected = categories.find(c => c.id === categoryId) ?? null;
  // La categoria scelta resta visibile tra i bottoni anche se non è tra le più usate.
  const buttons = selected && !top.includes(selected) ? [...top.slice(0, 5), selected] : top;
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => categoryLabel(a.name).localeCompare(categoryLabel(b.name), "it")),
    [categories],
  );

  const today = todayISO();
  const impacts = accountBalanceImpact(before, after, accounts, today);
  const anchored = beforeAnchor(before, after, accounts);
  const currentAccountMissing = !!accountId && !accounts.some(a => a.id === accountId);

  function pickAccount(id: string) {
    // La persona segue il conto, se finora seguiva quello di prima (come nell'import).
    const prev = accounts.find(a => a.id === accountId);
    const next = accounts.find(a => a.id === id);
    if (next?.member_id && familyMembers.some(m => m.id === next.member_id) && (memberId || null) === (prev?.member_id ?? null)) {
      setMemberId(next.member_id);
    }
    setAccountId(id);
  }

  async function save() {
    if (parsed === null) { toast.error("Scrivi un importo valido, per esempio 12,50."); return; }
    if (!description.trim()) { toast.error("Scrivi una descrizione."); return; }
    if (!date) { toast.error("Scegli una data."); return; }
    if (changed.length === 0) { onClose(); return; }
    if (demoGuard()) return;

    setSaving(true);
    const patch: Partial<EditableTx> = {};
    for (const f of changed) Object.assign(patch, { [f]: after[f] });
    const res = await updateTransaction(tx.id, patch);
    setSaving(false);
    if ("error" in res && res.error) { toast.error(`Non sono riuscito a salvare: ${res.error}`); return; }
    if (!("transaction" in res) || !res.transaction) { toast.error("Non sono riuscito a salvare."); return; }

    track("transaction_edited", { fields: changed.join(",") });
    toast.success("Movimento aggiornato.");
    onSaved(res.transaction as Transaction, changed);
  }

  async function remove() {
    if (await onDelete(tx.id)) onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog" aria-modal="true" aria-labelledby="tx-sheet-title"
        className="relative bg-background border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92svh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="tx-sheet-title" ref={titleRef} tabIndex={-1} className="font-semibold text-lg focus:outline-none">Modifica movimento</h2>
          <button
            type="button" onClick={onClose} aria-label="Chiudi"
            className="min-h-11 min-w-11 -mr-2 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xl leading-none"
          >✕</button>
        </div>

        {/* Entrata o uscita + importo */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Entrata o uscita">
            <button
              type="button" onClick={() => setSign(-1)} aria-pressed={sign === -1}
              className={`min-h-11 rounded-lg border text-sm font-medium transition-colors ${sign === -1 ? "bg-red-500/10 border-red-500 text-red-600 dark:text-red-400" : "hover:bg-muted/50"}`}
            >↓ Uscita</button>
            <button
              type="button" onClick={() => setSign(1)} aria-pressed={sign === 1}
              className={`min-h-11 rounded-lg border text-sm font-medium transition-colors ${sign === 1 ? "bg-green-500/10 border-green-600 text-green-700 dark:text-green-400" : "hover:bg-muted/50"}`}
            >↑ Entrata</button>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Importo</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold w-6 text-center ${sign === 1 ? "text-green-600 dark:text-green-400" : "text-red-500"}`} aria-hidden="true">
                {sign === 1 ? "+" : "−"}
              </span>
              <input
                inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                aria-invalid={parsed === null}
                className={`${fieldBase} text-xl font-semibold`}
              />
              <span className="text-muted-foreground">€</span>
            </div>
            {parsed === null && <span className="text-xs text-red-500">Scrivi un importo, per esempio 12,50.</span>}
          </label>
        </div>

        {/* Categoria */}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground" id="tx-sheet-cat">Categoria</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="tx-sheet-cat">
            {buttons.map(c => (
              <button
                key={c.id} type="button" onClick={() => setCategoryId(c.id)} aria-pressed={categoryId === c.id}
                className={`min-h-11 rounded-lg border px-3 text-sm text-left flex items-center gap-2 transition-colors ${categoryId === c.id ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
              >
                <span aria-hidden="true">{c.icon}</span>
                <span className="truncate">{categoryLabel(c.name)}</span>
              </button>
            ))}
          </div>
          <select
            value={buttons.some(c => c.id === categoryId) ? "" : categoryId}
            onChange={e => { if (e.target.value) setCategoryId(e.target.value); }}
            aria-label="Altre categorie"
            className={field}
          >
            <option value="">Altre categorie…</option>
            {sortedCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {categoryLabel(c.name)}</option>)}
          </select>
          {!categoryId && <p className="text-xs text-amber-600 dark:text-amber-400">Questo movimento non ha ancora una categoria.</p>}
          {selected && isTransferName(selected.name) && (
            <p className="text-xs text-muted-foreground">
              I giroconti non contano né nelle entrate né nelle uscite, ma cambiano il saldo del conto.
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Data</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Descrizione</span>
          <input value={description} onChange={e => setDescription(e.target.value)} className={field} />
        </label>

        {familyMembers.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Persona</span>
            <select value={memberId} onChange={e => setMemberId(e.target.value)} className={field}>
              <option value="">Nessuna</option>
              {familyMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}

        {accounts.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Conto</span>
            <select value={accountId} onChange={e => pickAccount(e.target.value)} className={field}>
              {!before.account_id && <option value="">Nessun conto</option>}
              {currentAccountMissing && <option value={accountId}>Conto archiviato</option>}
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}

        {(impacts.length > 0 || anchored) && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm flex flex-col gap-1">
            {impacts.map(i => (
              <p key={i.accountId}>
                Il saldo di oggi di «{i.name}» in Flusso {i.delta > 0 ? "sale" : "scende"} di{" "}
                <span className="font-semibold">{formatEuro(Math.abs(i.delta))}</span>.
              </p>
            ))}
            {anchored && (
              <p className="text-muted-foreground">
                Il movimento è del {new Date(`${after.date}T00:00:00`).toLocaleDateString("it-IT")}, entro il saldo di «{anchored.name}» controllato con la banca: quel saldo non cambia.
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Nota (facoltativa)</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${field} py-2`} />
        </label>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 min-h-11 border rounded-lg text-sm hover:bg-muted/50 transition-colors">
            Annulla
          </button>
          <button
            type="button" onClick={save} disabled={saving}
            className="flex-1 min-h-11 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? "Salvo…" : changed.length ? "Salva" : "Fatto"}
          </button>
        </div>

        <button
          type="button" onClick={remove}
          className="min-h-11 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Elimina movimento
        </button>
      </div>
    </div>,
    document.body,
  );
}
