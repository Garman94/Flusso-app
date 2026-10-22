"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatEuro } from "@/lib/calculations";
import { parseAmount } from "@/lib/import-parse";
import { track } from "@/lib/track";
import { balanceAt, reconcile, type Account, type AccountTx, type Reconciliation } from "@/lib/accounts";
import { assignUnassigned, confirmBankBalance, createAccount, deleteAccount, linkPot } from "./actions";

// Pagina Conti (migration 048). Calcoli in lib/accounts.ts.

export type UnassignedGroup = { memberId: string | null; count: number; from: string; to: string };
type Member = { id: string; name: string; color: string; is_owner: boolean | null };
type Pot = { id: string; name: string; emoji: string; current_balance: number; account_id: string | null };

const card = "rounded-2xl border p-5 flex flex-col gap-3";
const inputClass = "border-2 rounded-xl px-3 py-2.5 text-base bg-background focus:outline-none focus:border-primary transition-colors w-full";
const primaryBtn = "bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50";
const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-primary bg-primary/10" : "hover:bg-muted"}`;

function fmtDate(iso: string, today: string): string {
  const d = new Date(iso + "T00:00:00");
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

export function ContiClient({ accounts, txs, members, pots, unassigned, today }: {
  accounts: Account[];
  txs: AccountTx[];
  members: Member[];
  pots: Pot[];
  unassigned: UnassignedGroup[];
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(accounts.length === 0);
  const [form, setForm] = useState({ name: "", memberId: null as string | null, balance: "" });
  const [checking, setChecking] = useState<string | null>(null);
  const [bankInput, setBankInput] = useState("");
  const [check, setCheck] = useState<Reconciliation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});

  const memberName = (id: string | null) => (id ? members.find(m => m.id === id)?.name ?? "?" : null);
  const balances = useMemo(() => new Map(accounts.map(a => [a.id, balanceAt(a, txs, today)])), [accounts, txs, today]);
  const totalAccounts = accounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
  const totalPots = pots.reduce((s, p) => s + p.current_balance, 0);
  const unassignedTotal = unassigned.reduce((s, g) => s + g.count, 0);

  /** Conto proposto per i movimenti di una persona: il suo, poi quello del titolare, poi il primo. */
  function defaultAccount(memberId: string | null): string {
    const own = memberId ? accounts.find(a => a.member_id === memberId) : undefined;
    const ownerId = members.find(m => m.is_owner)?.id;
    const owner = ownerId ? accounts.find(a => a.member_id === ownerId) : undefined;
    return (own ?? owner ?? accounts[0])?.id ?? "";
  }

  function run(action: () => Promise<{ error?: string }>, ok?: string, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.error) { toast.error(res.error); return; }
      if (ok) toast.success(ok);
      after?.();
      router.refresh();
    });
  }

  function submitCreate() {
    const balance = parseAmount(form.balance);
    if (!form.name.trim()) { toast.error("Dai un nome al conto."); return; }
    if (balance === null) { toast.error("Scrivi quanto c'è oggi sul conto."); return; }
    run(() => createAccount({ name: form.name, memberId: form.memberId, balance }), `${form.name.trim()} creato`, () => {
      void track("account_created", { first: accounts.length === 0, owner: !!form.memberId });
      setForm({ name: "", memberId: null, balance: "" });
      setShowCreate(false);
    });
  }

  function startCheck(a: Account) {
    setChecking(a.id);
    setBankInput("");
    setCheck(null);
  }

  function runCheck(a: Account) {
    const bank = parseAmount(bankInput);
    if (bank === null) { toast.error("Scrivi il saldo che vedi nell'app della banca."); return; }
    const r = reconcile(a, txs, bank, today);
    setCheck(r);
    void track("account_checked", { ok: r.ok, days_since_last: r.daysSinceLast ?? -1, duplicates: r.duplicates.length });
    if (r.ok) run(() => confirmBankBalance(a.id, bank, false), "✅ Quadra con la banca");
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Dashboard</Link>
        <h1 className="text-2xl font-bold">Conti</h1>
        <p className="text-sm text-muted-foreground">
          Il saldo di ogni conto, controllato con la banca. In dashboard il saldo di oggi è la somma dei conti.
        </p>
      </div>

      {accounts.length > 0 && (
        <div className={card}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-xs text-muted-foreground">Sui conti</p><p className="font-bold tabular-nums">{formatEuro(totalAccounts)}</p></div>
            <div><p className="text-xs text-muted-foreground">Nei salvadanai</p><p className="font-bold tabular-nums">{formatEuro(totalPots)}</p></div>
            <div><p className="text-xs text-muted-foreground">In tutto</p><p className="font-bold tabular-nums">{formatEuro(totalAccounts + totalPots)}</p></div>
          </div>
        </div>
      )}

      {accounts.map(a => {
        const balance = balances.get(a.id) ?? 0;
        const linked = pots.filter(p => p.account_id === a.id);
        const free = pots.filter(p => !p.account_id);
        const owner = memberName(a.member_id);
        return (
          <div key={a.id} className={card}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">🏦 {a.name}</p>
                <p className="text-xs text-muted-foreground">{owner ?? "In comune"}</p>
              </div>
              <p className="text-2xl font-bold tabular-nums shrink-0">{formatEuro(balance)}</p>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              {a.checked_at
                ? a.checked_at === today ? "✅ Quadra con la banca, controllato oggi" : `Ultimo controllo con la banca: ${fmtDate(a.checked_at, today)}`
                : "Mai controllato con la banca"}
            </p>

            {/* Salvadanai dentro questo conto */}
            {(linked.length > 0 || free.length > 0) && (
              <div className="flex flex-col gap-1.5 text-sm">
                {linked.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{p.emoji} {p.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatEuro(p.current_balance)}</span>
                      <button onClick={() => run(() => linkPot(p.id, null))} disabled={pending} title="Scollega" className="text-xs text-muted-foreground hover:text-destructive">✕</button>
                    </span>
                  </div>
                ))}
                {linked.length > 0 && (
                  <div className="flex justify-between border-t pt-1.5 font-medium">
                    <span>Conto + salvadanai</span>
                    <span className="tabular-nums">{formatEuro(balance + linked.reduce((s, p) => s + p.current_balance, 0))}</span>
                  </div>
                )}
                {free.length > 0 && (
                  <select
                    value=""
                    onChange={e => { const id = e.target.value; if (id) run(() => linkPot(id, a.id), "Salvadanaio collegato"); }}
                    className="text-xs text-muted-foreground bg-transparent border rounded-lg px-2 py-1.5 w-fit"
                  >
                    <option value="">+ Un salvadanaio sta in questo conto…</option>
                    {free.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name} ({formatEuro(p.current_balance)})</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Quadra con la banca */}
            {checking === a.id ? (
              <div className="flex flex-col gap-3 border-t pt-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Quanto c&apos;è oggi sul conto nell&apos;app della banca (senza salvadanai e accantonamenti, se la banca li tiene a parte)
                  <input autoFocus inputMode="decimal" className={inputClass} placeholder="728,42" value={bankInput}
                    onChange={e => { setBankInput(e.target.value); setCheck(null); }} />
                </label>
                {!check && (
                  <div className="flex gap-2">
                    <button onClick={() => runCheck(a)} disabled={pending || !bankInput} className={primaryBtn}>Controlla</button>
                    <button onClick={() => setChecking(null)} className="text-sm text-muted-foreground px-3">Annulla</button>
                  </div>
                )}
                {check?.ok && <p className="text-sm">✅ Quadra: Flusso e banca dicono tutti e due <strong>{formatEuro(check.bank)}</strong>.</p>}
                {check && !check.ok && (
                  <div className="flex flex-col gap-2 text-sm">
                    <p>
                      Flusso dice <strong>{formatEuro(check.flusso)}</strong>, la banca <strong>{formatEuro(check.bank)}</strong>:
                      {" "}in banca c&apos;è <strong>{formatEuro(Math.abs(check.diff))} {check.diff > 0 ? "in più" : "in meno"}</strong>.
                    </p>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground flex flex-col gap-1">
                      {check.lastMovement === null && <li>In Flusso questo conto non ha ancora movimenti: assegnagli quelli senza conto qui sotto e carica i file nuovi.</li>}
                      {check.daysSinceLast !== null && check.daysSinceLast >= 2 && (
                        <li>L&apos;ultimo movimento di questo conto in Flusso è del <strong className="text-foreground">{fmtDate(check.lastMovement!, today)}</strong>: se dopo ci sono stati pagamenti o accrediti, <Link href="/dashboard/transazioni?import=1" className="text-primary underline">carica il file aggiornato</Link>.</li>
                      )}
                      {check.duplicates.length > 0 && (
                        <li>
                          {check.duplicates.length === 1 ? "C'è un movimento che sembra doppio" : `Ci sono ${check.duplicates.length} movimenti che sembrano doppi`}:{" "}
                          {check.duplicates.slice(0, 3).map(d => `${fmtDate(d.date, today)} ${d.description} ${formatEuro(d.amount)} (×${d.count})`).join("; ")}.
                        </li>
                      )}
                      <li>Pagamenti con carta ancora &quot;in attesa&quot; possono spostare il saldo della banca di qualche euro.</li>
                    </ul>
                    <div className="flex flex-col gap-2 pt-1">
                      <button onClick={() => run(() => confirmBankBalance(a.id, check.bank, true), "Ripartito dal saldo della banca", () => setChecking(null))}
                        disabled={pending} className={primaryBtn}>
                        La banca ha ragione: riparti da {formatEuro(check.bank)}
                      </button>
                      <p className="text-[11px] text-muted-foreground">Non crea movimenti finti: entrate e uscite restano quelle vere, cambia solo il punto di partenza del saldo.</p>
                      <button onClick={() => setChecking(null)} className="text-sm text-muted-foreground">Controllo dopo</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => startCheck(a)} className="text-sm text-primary font-medium">⚖️ Quadra con la banca</button>
                {confirmDelete === a.id ? (
                  <span className="flex items-center gap-1 text-xs">
                    <button onClick={() => run(() => deleteAccount(a.id), `${a.name} eliminato`, () => setConfirmDelete(null))}
                      disabled={pending} className="rounded px-2 py-1 bg-destructive text-white">Sì, elimina</button>
                    <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground px-1">No</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(a.id)} className="text-xs text-muted-foreground hover:text-destructive">Elimina</button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Movimenti senza conto */}
      {accounts.length > 0 && unassignedTotal > 0 && (
        <div className={`${card} border-amber-500/50 bg-amber-500/5`}>
          <h2 className="font-semibold">🔗 {unassignedTotal} movimenti senza conto</h2>
          <p className="text-xs text-muted-foreground">
            Mettili sul conto giusto. Il saldo di oggi non cambia (erano già nel saldo della banca), ma ogni conto ha la sua storia
            e Flusso può trovare i doppioni.
          </p>
          {unassigned.map(g => {
            const key = g.memberId ?? "";
            const target = assignTo[key] ?? defaultAccount(g.memberId);
            return (
              <div key={key} className="flex flex-col gap-2 border-t pt-3 text-sm">
                <p>
                  <strong>{memberName(g.memberId) ?? "Senza persona"}</strong> · {g.count} movimenti
                  <span className="text-muted-foreground"> · dal {fmtDate(g.from, today)} al {fmtDate(g.to, today)}</span>
                </p>
                <div className="flex gap-2">
                  <select value={target} onChange={e => setAssignTo(prev => ({ ...prev, [key]: e.target.value }))}
                    className="border rounded-lg px-2 py-2 text-sm bg-background flex-1 min-w-0">
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button disabled={pending || !target} className={primaryBtn}
                    onClick={() => run(() => assignUnassigned(g.memberId, target), `${g.count} movimenti assegnati`)}>
                    Assegna
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nuovo conto */}
      {showCreate ? (
        <div className={card}>
          <h2 className="font-semibold">{accounts.length ? "Nuovo conto" : "Aggiungi i tuoi conti"}</h2>
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Un conto per ogni conto in banca (anche carte prepagate o contanti, se vuoi). Ti chiedo quanto c&apos;è oggi:
              da lì Flusso lo aggiorna con i movimenti che carichi, e quando vuoi lo controlli con la banca.
            </p>
          )}
          <input className={inputClass} placeholder="Nome, es. Intesa Samira" maxLength={40} value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          {members.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {members.map(m => (
                <button key={m.id} type="button" onClick={() => setForm({ ...form, memberId: m.id })} className={chip(form.memberId === m.id)}>{m.name}</button>
              ))}
              <button type="button" onClick={() => setForm({ ...form, memberId: null })} className={chip(form.memberId === null)}>In comune</button>
            </div>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Quanto c&apos;è oggi sul conto (dall&apos;app della banca, senza salvadanai e accantonamenti se li tiene a parte)
            <input inputMode="decimal" className={inputClass} placeholder="728,42" value={form.balance}
              onChange={e => setForm({ ...form, balance: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <button onClick={submitCreate} disabled={pending} className={primaryBtn}>Crea conto</button>
            {accounts.length > 0 && <button onClick={() => setShowCreate(false)} className="text-sm text-muted-foreground px-3">Annulla</button>}
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)} className="text-sm text-primary font-medium text-left">+ Aggiungi un conto</button>
      )}
    </div>
  );
}
