"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatEuro } from "@/lib/calculations";
import { useDemoGuard } from "@/components/demo-context";
import {
  POT_SUGGESTIONS, POT_EMOJIS, potProgress, potsTotal,
  type SavingsPot, type SavingsPotMember, type SavingsTransaction,
} from "@/lib/savings";
import { createPot, updatePot, deletePot, addSavingsTransaction } from "./savings-actions";

type Member = { id: string; name: string; color: string };

type Props = {
  userId: string;
  initialPots: SavingsPot[];
  familyMembers: Member[];
  potMembers: SavingsPotMember[];
  initialTransactions: SavingsTransaction[];
};

const COLORS = ["#6366f1", "#ec4899", "#f97316", "#22c55e", "#3b82f6", "#a855f7", "#eab308", "#14b8a6"];

export function SalvadanaiClient({ initialPots, familyMembers, potMembers, initialTransactions }: Props) {
  const router = useRouter();
  const demoGuard = useDemoGuard();

  const [view, setView] = useState<"list" | "wizard" | "detail">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // wizard
  const [wStep, setWStep] = useState(1);
  const [wEditId, setWEditId] = useState<string | null>(null);
  const [wName, setWName] = useState("");
  const [wEmoji, setWEmoji] = useState("🐷");
  const [wHasTarget, setWHasTarget] = useState(false);
  const [wTarget, setWTarget] = useState("");
  const [wShared, setWShared] = useState(false);
  const [wMembers, setWMembers] = useState<(string | null)[]>([]);
  const [wColor, setWColor] = useState(COLORS[0]);

  // deposit/withdraw modal
  const [txModal, setTxModal] = useState<{ potId: string; type: "deposit" | "withdraw" } | null>(null);
  const [txAmount, setTxAmount] = useState("");
  const [txNote, setTxNote] = useState("");
  const [txMember, setTxMember] = useState<string | null>(null);

  const total = useMemo(() => potsTotal(initialPots), [initialPots]);
  const detailPot = initialPots.find(p => p.id === detailId) ?? null;
  const detailTx = initialTransactions.filter(t => t.pot_id === detailId);
  const membersOf = (potId: string) => potMembers.filter(m => m.pot_id === potId);
  const memberName = (id: string | null) => id === null ? "Io" : (familyMembers.find(m => m.id === id)?.name ?? "—");

  function resetWizard() {
    setWStep(1); setWEditId(null); setWName(""); setWEmoji("🐷");
    setWHasTarget(false); setWTarget(""); setWShared(false); setWMembers([]); setWColor(COLORS[0]);
  }

  function openCreate() {
    if (demoGuard()) return;
    resetWizard();
    setView("wizard");
  }

  function openEdit(pot: SavingsPot) {
    if (demoGuard()) return;
    setWEditId(pot.id);
    setWName(pot.name);
    setWEmoji(pot.emoji);
    setWHasTarget(pot.target_amount != null);
    setWTarget(pot.target_amount != null ? String(pot.target_amount) : "");
    setWShared(pot.is_shared);
    setWMembers(membersOf(pot.id).map(m => m.member_id));
    setWColor(pot.color);
    setWStep(1);
    setView("wizard");
  }

  async function saveWizard() {
    const target = wHasTarget ? parseFloat(wTarget.replace(",", ".")) : null;
    if (wHasTarget && (target == null || isNaN(target) || target <= 0)) {
      toast.error("Inserisci un obiettivo valido."); return;
    }
    setBusy(true);
    const base = { name: wName, emoji: wEmoji, target_amount: target, is_shared: wShared, color: wColor };
    const res = wEditId
      ? await updatePot(wEditId, base)
      : await createPot({ ...base, memberIds: wShared ? wMembers : [] });
    setBusy(false);
    if (res?.error) { toast.error(res.error); return; }
    toast.success(wEditId ? "Salvadanaio aggiornato!" : "Salvadanaio creato!");
    setView("list");
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (demoGuard()) return;
    if (!confirm("Eliminare questo salvadanaio? I movimenti verranno persi.")) return;
    setBusy(true);
    const res = await deletePot(id);
    setBusy(false);
    if (res?.error) { toast.error(res.error); return; }
    toast.success("Salvadanaio eliminato.");
    setView("list");
    setDetailId(null);
    router.refresh();
  }

  async function submitTx() {
    if (!txModal) return;
    if (demoGuard()) return;
    const amount = parseFloat(txAmount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) { toast.error("Importo non valido."); return; }
    setBusy(true);
    const res = await addSavingsTransaction({
      potId: txModal.potId, amount, type: txModal.type,
      note: txNote, memberId: txMember,
    });
    setBusy(false);
    if (res?.error) { toast.error(res.error); return; }
    toast.success(txModal.type === "deposit" ? "Deposito registrato!" : "Prelievo registrato!");
    setTxModal(null); setTxAmount(""); setTxNote(""); setTxMember(null);
    router.refresh();
  }

  // ─── WIZARD ────────────────────────────────────────────────────────────────
  if (view === "wizard") {
    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <div className="flex items-center justify-between">
          <button onClick={() => setView("list")} className="text-sm text-muted-foreground hover:text-foreground">← Annulla</button>
          <span className="text-xs text-muted-foreground">Passo {wStep} di 4</span>
        </div>

        {wStep === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">Come vuoi chiamarlo?</h2>
            <input
              value={wName} onChange={e => setWName(e.target.value)} autoFocus
              placeholder="es. Vacanza, Emergenza…"
              className="border-2 rounded-xl px-4 py-3 bg-background focus:outline-none focus:border-primary"
            />
            <div className="flex flex-wrap gap-2">
              {POT_SUGGESTIONS.map(s => (
                <button key={s.name} type="button"
                  onClick={() => { setWName(s.name); setWEmoji(s.emoji); }}
                  className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted/50">
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Emoji</label>
              <div className="flex flex-wrap gap-1.5">
                {POT_EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setWEmoji(e)}
                    className={`text-xl p-2 rounded-lg border-2 ${wEmoji === e ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/50"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Colore</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setWColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${wColor === c ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <button
              onClick={() => { if (!wName.trim()) { toast.error("Inserisci un nome."); return; } setWStep(2); }}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90">
              Continua →
            </button>
          </div>
        )}

        {wStep === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">Hai un obiettivo?</h2>
            <button type="button" onClick={() => setWHasTarget(true)}
              className={`rounded-xl border-2 px-4 py-3 text-left text-sm ${wHasTarget ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
              Sì, voglio raggiungere una cifra
            </button>
            {wHasTarget && (
              <input value={wTarget} onChange={e => setWTarget(e.target.value)} inputMode="decimal"
                placeholder="Es. 2000" autoFocus
                className="border-2 rounded-xl px-4 py-3 bg-background focus:outline-none focus:border-primary" />
            )}
            <button type="button" onClick={() => { setWHasTarget(false); setWTarget(""); }}
              className={`rounded-xl border-2 px-4 py-3 text-left text-sm ${!wHasTarget ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
              No, risparmio libero
            </button>
            <div className="flex gap-2">
              <button onClick={() => setWStep(1)} className="flex-1 rounded-xl border-2 px-4 py-3 text-sm hover:bg-muted/50">← Indietro</button>
              <button onClick={() => setWStep(3)} className="flex-1 bg-primary text-primary-foreground rounded-xl px-4 py-3 text-sm font-semibold hover:bg-primary/90">Continua →</button>
            </div>
          </div>
        )}

        {wStep === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">È condiviso?</h2>
            <button type="button" onClick={() => setWShared(false)}
              className={`rounded-xl border-2 px-4 py-3 text-left text-sm ${!wShared ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
              Solo mio
            </button>
            <button type="button" onClick={() => setWShared(true)}
              className={`rounded-xl border-2 px-4 py-3 text-left text-sm ${wShared ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
              Condiviso con il gruppo
            </button>
            {wShared && (
              familyMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aggiungi prima dei Componenti in Impostazioni per ripartire i contributi.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Chi può contribuire?</p>
                  {[{ id: null as string | null, name: "Io" }, ...familyMembers].map(m => {
                    const on = wMembers.includes(m.id);
                    return (
                      <label key={m.id ?? "owner"} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={on}
                          onChange={e => setWMembers(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))} />
                        {m.name}
                      </label>
                    );
                  })}
                </div>
              )
            )}
            <div className="flex gap-2">
              <button onClick={() => setWStep(2)} className="flex-1 rounded-xl border-2 px-4 py-3 text-sm hover:bg-muted/50">← Indietro</button>
              <button onClick={() => setWStep(4)} className="flex-1 bg-primary text-primary-foreground rounded-xl px-4 py-3 text-sm font-semibold hover:bg-primary/90">Continua →</button>
            </div>
          </div>
        )}

        {wStep === 4 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">Tutto corretto?</h2>
            <div className="rounded-2xl border-2 p-5 flex flex-col gap-2">
              <div className="flex items-center gap-3 pb-2 border-b">
                <span className="text-3xl">{wEmoji}</span>
                <span className="font-bold text-lg">{wName}</span>
              </div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Obiettivo</span>
                <span>{wHasTarget && wTarget ? formatEuro(parseFloat(wTarget.replace(",", "."))) : "Nessuno"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Condiviso</span>
                <span>{wShared ? "Sì" : "No"}</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWStep(1)} className="flex-1 rounded-xl border-2 px-4 py-3 text-sm hover:bg-muted/50">✏️ Modifica</button>
              <button onClick={saveWizard} disabled={busy}
                className="flex-1 bg-primary text-primary-foreground rounded-xl px-4 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {busy ? "Salvataggio…" : wEditId ? "Salva ✓" : "Crea salvadanaio ✓"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── DETAIL ────────────────────────────────────────────────────────────────
  if (view === "detail" && detailPot) {
    const pct = potProgress(detailPot);
    return (
      <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
        <button onClick={() => setView("list")} className="text-sm text-muted-foreground hover:text-foreground self-start">← Tutti i salvadanai</button>

        <div className="rounded-2xl border-2 p-5 flex flex-col gap-3" style={{ borderColor: detailPot.color + "55" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{detailPot.emoji}</span>
              <div>
                <h1 className="font-bold text-lg">{detailPot.name}</h1>
                {detailPot.is_shared && <span className="text-xs text-muted-foreground">Condiviso</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(detailPot)} className="text-xs border rounded-lg px-2 py-1 hover:bg-muted/50">✏️</button>
              <button onClick={() => handleDelete(detailPot.id)} className="text-xs border rounded-lg px-2 py-1 hover:text-destructive">🗑</button>
            </div>
          </div>
          <span className="text-3xl font-bold tabular-nums">{formatEuro(Number(detailPot.current_balance))}</span>
          {pct != null && detailPot.target_amount != null && (
            <div className="flex flex-col gap-1">
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatEuro(Number(detailPot.current_balance))}</span>
                <span>{pct.toFixed(0)}%</span>
                <span>{formatEuro(Number(detailPot.target_amount))}</span>
              </div>
            </div>
          )}
          {detailPot.is_shared && membersOf(detailPot.id).length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs pt-1">
              {membersOf(detailPot.id).map(m => (
                <span key={m.id} className="px-2 py-0.5 rounded-full bg-muted">
                  {memberName(m.member_id)}: {formatEuro(Number(m.contributed_amount))}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => { setTxMember(null); setTxModal({ potId: detailPot.id, type: "deposit" }); }}
            className="flex-1 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90">
            + Deposita
          </button>
          <button onClick={() => { setTxMember(null); setTxModal({ potId: detailPot.id, type: "withdraw" }); }}
            className="flex-1 border-2 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-muted/50">
            − Preleva
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-sm">Movimenti</h2>
          {detailTx.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessun movimento.</p>
          ) : (
            <ul className="divide-y border rounded-xl">
              {detailTx.map(t => (
                <li key={t.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <div className="flex flex-col">
                    <span>{t.note || (t.type === "deposit" ? "Deposito" : "Prelievo")}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(t.date).toLocaleDateString("it-IT")}
                      {t.member_id !== null || detailPot.is_shared ? ` · ${memberName(t.member_id)}` : ""}
                    </span>
                  </div>
                  <span className={`font-semibold tabular-nums ${t.type === "deposit" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                    {t.type === "deposit" ? "+" : "−"}{formatEuro(Number(t.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {txModal && <TxModalUI />}
      </div>
    );
  }

  // ─── LIST ──────────────────────────────────────────────────────────────────
  function TxModalUI() {
    if (!txModal) return null;
    const pot = initialPots.find(p => p.id === txModal.potId);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTxModal(null)}>
        <div className="bg-background border rounded-xl p-5 w-full max-w-sm flex flex-col gap-3" onClick={e => e.stopPropagation()}>
          <h3 className="font-semibold">{txModal.type === "deposit" ? "Deposita" : "Preleva"} — {pot?.emoji} {pot?.name}</h3>
          <input value={txAmount} onChange={e => setTxAmount(e.target.value)} inputMode="decimal" autoFocus
            placeholder="Importo €" className="border rounded-md px-3 py-2 text-sm bg-background" />
          <input value={txNote} onChange={e => setTxNote(e.target.value)}
            placeholder="Nota (opzionale)" className="border rounded-md px-3 py-2 text-sm bg-background" />
          {pot?.is_shared && (
            <select value={txMember ?? ""} onChange={e => setTxMember(e.target.value || null)}
              className="border rounded-md px-3 py-2 text-sm bg-background">
              <option value="">Io</option>
              {familyMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <button onClick={() => setTxModal(null)} className="flex-1 border rounded-md px-4 py-2 text-sm hover:bg-muted/50">Annulla</button>
            <button onClick={submitTx} disabled={busy}
              className="flex-1 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              Conferma
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Salvadanai 🐷</h1>
          <p className="text-sm text-muted-foreground">Totale: <strong>{formatEuro(total)}</strong></p>
        </div>
        <button onClick={openCreate} data-tour="pot-add"
          className="text-sm bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90">
          + Nuovo
        </button>
      </div>

      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        💡 Se la tua banca ha un solo salvadanaio, corrisponde alla somma di tutti i tuoi salvadanai Flusso ({formatEuro(total)} totale).
      </div>

      {initialPots.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="text-5xl">🐷</span>
          <p className="text-muted-foreground">Nessun salvadanaio ancora.</p>
          <button onClick={openCreate} className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary/90">
            Crea il primo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-tour="pot-grid">
          {initialPots.map(pot => {
            const pct = potProgress(pot);
            return (
              <button key={pot.id}
                onClick={() => { setDetailId(pot.id); setView("detail"); }}
                className="rounded-2xl border-2 p-5 flex flex-col gap-3 text-left hover:border-primary/40 transition-colors"
                style={{ borderColor: pot.color + "40" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{pot.emoji}</span>
                    <span className="font-semibold">{pot.name}</span>
                  </div>
                  {pot.is_shared && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">condiviso</span>}
                </div>
                <span className="text-2xl font-bold tabular-nums">{formatEuro(Number(pot.current_balance))}</span>
                {pct != null && pot.target_amount != null && (
                  <div className="flex flex-col gap-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pot.color }} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatEuro(Number(pot.current_balance))} / {formatEuro(Number(pot.target_amount))}
                    </span>
                  </div>
                )}
                {pot.is_shared && membersOf(pot.id).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {membersOf(pot.id).map(m => (
                      <span key={m.id} className="px-1.5 py-0.5 rounded bg-muted">
                        {memberName(m.member_id)}: {formatEuro(Number(m.contributed_amount))}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {txModal && <TxModalUI />}
    </div>
  );
}
