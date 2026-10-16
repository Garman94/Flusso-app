"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatEuro, sinkingFundInput } from "@/lib/calculations";
import { emergencyLimit, planEmergency, sinkingGroups, type EmergencyLimit, type EmergencyPlan } from "@/lib/emergency";
import { useDemoGuard } from "@/components/demo-context";
import { track } from "@/lib/track";
import { withdrawForEmergency, type EmergencyResult } from "./emergency-actions";

type Pot = { id: string; name: string; emoji: string | null; current_balance: number };
type Goal = { name: string; savings_pot_id: string | null };
type Item = {
  id: string; name: string; tipologia: string; amount: number; amount_max: number | null;
  next_due_date: string | null; saving_start_date: string | null; saving_offset?: number | null;
  savings_pot_id: string | null;
};
type Data = { pots: Pot[]; goals: Goal[]; items: Item[] };
type Done = Extract<EmergencyResult, { success: true }>;

const parse = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100) / 100;
};
const names = (items: { name: string }[]) => items.map(i => i.name).join(", ");
/** "fino a marzo 2027", "fino ad aprile 2027" */
const until = (iso: string) => {
  const m = new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return `${m.startsWith("a") ? "fino ad" : "fino a"} ${m}`;
};
const dayMonth = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });
const isEmergencyPot = (p: Pot) => /emergenz|imprevist/i.test(p.name);

/** Il tasto "🚨 Emergenza" e la sua finestra: dashboard (vicino ai salvadanai) e Accantonamenti. */
export function EmergencyButton({ userId, onDone, className }: {
  userId: string;
  onDone?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [overLimitOk, setOverLimitOk] = useState(false);
  const [linkPot, setLinkPot] = useState("");
  const [linking, setLinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const demoGuard = useDemoGuard();

  async function load() {
    const supabase = createClient();
    const [potsRes, goalsRes, recRes] = await Promise.all([
      supabase.from("savings_pots").select("id, name, emoji, current_balance").eq("user_id", userId).order("created_at"),
      supabase.from("goals").select("name, savings_pot_id").eq("user_id", userId),
      // "*": regge anche prima della migration 041 (saving_offset mancante = 0)
      supabase.from("recurring_expenses").select("*").eq("user_id", userId)
        .not("next_due_date", "is", null).not("saving_start_date", "is", null),
    ]);
    setData({
      pots: ((potsRes.data ?? []) as Pot[]).map(p => ({ ...p, current_balance: Number(p.current_balance) })),
      goals: (goalsRes.data ?? []) as Goal[],
      items: (recRes.data ?? []) as Item[],
    });
  }

  async function openDialog() {
    setOpen(true);
    setDone(null);
    setAmounts({});
    setNote("");
    setOverLimitOk(false);
    setLinkPot("");
    setData(null);
    await load();
    void track("emergency_opened");
  }

  function close() {
    if (saving) return;
    setOpen(false);
    if (done) onDone?.();
  }

  function setAmount(potId: string, value: string) {
    setAmounts(a => ({ ...a, [potId]: value }));
    setOverLimitOk(false);
  }

  // Per ogni gruppo di salvadanai che tiene accantonamenti: quanto si può prendere e cosa cambia.
  const groups = useMemo(() => {
    if (!data) return [];
    return sinkingGroups(data.pots, data.goals.map(g => g.savings_pot_id), data.items).map(g => {
      const inputs = data.items.filter(it => g.itemIds.includes(it.id)).map(sinkingFundInput);
      const balance = data.pots.filter(p => g.potIds.includes(p.id)).reduce((s, p) => s + p.current_balance, 0);
      const taken = g.potIds.reduce((s, id) => s + parse(amounts[id] ?? ""), 0);
      const limit: EmergencyLimit = emergencyLimit(inputs, balance);
      const plan: EmergencyPlan = planEmergency(inputs, balance, taken);
      return { ...g, limit, plan, taken };
    });
  }, [data, amounts]);

  const groupOf = (potId: string) => groups.find(g => g.potIds.includes(potId)) ?? null;
  const goalOf = (potId: string) => data?.goals.find(g => g.savings_pot_id === potId) ?? null;
  // Accantonamenti non collegati e più salvadanai "liberi": Flusso li cerca in tutti, fondo
  // emergenze compreso. Meglio collegarli al loro salvadanaio.
  const unlinked = !!data && data.items.length > 0 && data.items.every(it => !it.savings_pot_id)
    && groups.some(g => g.potIds.length > 1);

  // Prima il fondo emergenze (anche se è l'obiettivo "Fondo emergenza": è fatto per questo),
  // poi gli altri salvadanai liberi, poi quelli degli accantonamenti, per ultimi gli obiettivi.
  const sortedPots = useMemo(() => {
    if (!data) return [];
    const rank = (p: Pot) =>
      groups.some(g => g.potIds.includes(p.id)) ? 2 : isEmergencyPot(p) ? 0 : data.goals.some(g => g.savings_pot_id === p.id) ? 3 : 1;
    return [...data.pots].sort((a, b) => rank(a) - rank(b));
  }, [data, groups]);
  const firstFree = sortedPots.find(p => !groupOf(p.id) && (!goalOf(p.id) || isEmergencyPot(p)) && p.current_balance > 0) ?? null;

  const total = data ? data.pots.reduce((s, p) => s + parse(amounts[p.id] ?? ""), 0) : 0;
  const potTooMuch = (p: Pot) => parse(amounts[p.id] ?? "") > p.current_balance + 0.005;
  const overLimit = groups.some(g => g.plan.exceeds);
  const hasErrors = !!data && (data.pots.some(potTooMuch) || groups.some(g => g.plan.uncovered) || (overLimit && !overLimitOk));
  const changed = groups.filter(g => g.plan.items.length > 0);
  const monthlyBefore = changed.reduce((s, g) => s + g.plan.monthlyBefore, 0);
  const monthlyAfter = changed.reduce((s, g) => s + g.plan.monthlyAfter, 0);

  /** Il massimo consigliato per un salvadanaio: il saldo, e per gli accantonamenti anche il limite del gruppo. */
  function maxFor(p: Pot): number {
    const g = groupOf(p.id);
    if (!g) return p.current_balance;
    const others = g.potIds.filter(id => id !== p.id).reduce((s, id) => s + parse(amounts[id] ?? ""), 0);
    return Math.max(0, Math.min(p.current_balance, Math.round((g.limit.max - others) * 100) / 100));
  }

  async function linkSinkingPot() {
    if (demoGuard() || !linkPot) return;
    setLinking(true);
    const { error } = await createClient().from("recurring_expenses")
      .update({ savings_pot_id: linkPot })
      .eq("user_id", userId).not("next_due_date", "is", null);
    setLinking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Accantonamenti collegati.");
    setAmounts({});
    setOverLimitOk(false);
    await load();
  }

  async function confirm() {
    if (demoGuard()) return;
    if (!data || total <= 0 || hasErrors) return;
    setSaving(true);
    const res = await withdrawForEmergency({
      withdrawals: data.pots.map(p => ({ potId: p.id, amount: parse(amounts[p.id] ?? "") })).filter(w => w.amount > 0),
      note,
      overLimit: overLimitOk,
    });
    setSaving(false);
    if ("error" in res) { toast.error(res.error); return; }
    setDone(res);
    void track("emergency_used", {
      pots: Object.values(amounts).filter(a => parse(a) > 0).length,
      recalculated: res.monthlyAfter > res.monthlyBefore,
      over_limit: overLimit,
    });
  }

  const sinkingNotice = (g: (typeof groups)[number]) => {
    const dues = [...g.limit.thisMonth.items, ...g.limit.nextMonth.items];
    return (
      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs flex flex-col gap-1 text-amber-800 dark:text-amber-300">
        {g.limit.thisMonth.total > 0 && (
          <p>Questo mese devi ancora pagare <strong>{formatEuro(g.limit.thisMonth.total)}</strong> ({names(g.limit.thisMonth.items)}).</p>
        )}
        {g.limit.nextMonth.total > 0 && (
          <p>Il mese prossimo devi pagare <strong>{formatEuro(g.limit.nextMonth.total)}</strong> ({names(g.limit.nextMonth.items)}).</p>
        )}
        {g.limit.max > 0 ? (
          <p>
            Puoi prendere al massimo <strong>{formatEuro(g.limit.max)}</strong>
            {g.limit.reserve > 0 ? ": il resto serve per queste spese." : "."}
          </p>
        ) : (
          <p><strong>Meglio non prendere niente da qui</strong>: quello che c&apos;è serve per queste spese.</p>
        )}
        {g.plan.exceeds && !g.plan.uncovered && (
          <div className="mt-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-red-700 dark:text-red-300 flex flex-col gap-1.5">
            <p className="font-medium">
              Nel salvadanaio resterebbero {formatEuro(Math.max(0, g.limit.balance - g.taken))}, ma ne servono{" "}
              {formatEuro(g.limit.reserve)} per {names(dues)}.
            </p>
            <p>Dovrai rimetterli prima di quelle scadenze, oltre alla quota del mese.</p>
            <label className="flex items-start gap-2 pt-0.5 cursor-pointer">
              <input type="checkbox" checked={overLimitOk} onChange={e => setOverLimitOk(e.target.checked)} className="mt-0.5 shrink-0" />
              <span>Lo so, li prendo lo stesso</span>
            </label>
          </div>
        )}
        {g.plan.uncovered && (
          <p className="text-destructive font-medium">È più di quello che c&apos;è da parte per gli accantonamenti.</p>
        )}
      </div>
    );
  };

  const potRow = (p: Pot) => {
    const g = groupOf(p.id);
    const goal = goalOf(p.id);
    const max = maxFor(p);
    return (
      <div key={p.id} className="rounded-xl border p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">{p.emoji ?? "🐷"} {p.name}</span>
          <span className="text-sm tabular-nums text-muted-foreground shrink-0">{formatEuro(p.current_balance)}</span>
        </div>
        {(g || goal || (p === firstFree && groups.length > 0)) && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {p === firstFree && !g && (
              <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5">Prendi prima da qui: non tocca accantonamenti né obiettivi</span>
            )}
            {g && <span className="rounded-full bg-muted px-2 py-0.5">🏦 Accantonamenti</span>}
            {goal && <span className="rounded-full bg-muted px-2 py-0.5">🎯 Obiettivo &ldquo;{goal.name}&rdquo;: scende anche lui</span>}
          </div>
        )}
        {g && g.potIds.length === 1 && sinkingNotice(g)}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number" inputMode="decimal" step="0.01" min="0"
              aria-label={`Quanto prendi da ${p.name}`}
              placeholder="0,00"
              value={amounts[p.id] ?? ""}
              onChange={e => setAmount(p.id, e.target.value)}
              disabled={p.current_balance <= 0}
              className="w-full border-2 rounded-xl pl-3 pr-8 py-2 text-base bg-background focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
          </div>
          <button
            type="button"
            onClick={() => setAmount(p.id, max > 0 ? max.toFixed(2) : "")}
            disabled={max <= 0}
            className="text-xs border rounded-lg px-2.5 py-2 hover:bg-muted/50 disabled:opacity-40 transition-colors shrink-0"
          >
            {g ? "Massimo" : "Tutto"}
          </button>
        </div>
        {potTooMuch(p) && <p className="text-xs text-destructive">Ci sono solo {formatEuro(p.current_balance)}.</p>}
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={className ?? "shrink-0 whitespace-nowrap text-xs font-medium rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 px-2.5 py-1.5 hover:bg-red-500/10 transition-colors"}
      >
        🚨 Emergenza
      </button>

      {/* Portale su body e z-[60]: sopra la barra di navigazione del telefono (z-50), che
          altrimenti coprirebbe i pulsanti in fondo alla finestra. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
          <div
            role="dialog" aria-modal="true" aria-labelledby="emergency-title"
            className="relative bg-background border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92svh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 id="emergency-title" className="font-bold text-base">🚨 Emergenza</h2>
              <button onClick={close} disabled={saving} aria-label="Chiudi" className="text-muted-foreground hover:text-foreground text-lg leading-none disabled:opacity-50">✕</button>
            </div>

            {done ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-4 text-sm flex flex-col gap-1">
                  <p className="font-semibold">Fatto: hai preso {formatEuro(done.total)}.</p>
                  {done.monthlyAfter > done.monthlyBefore + 0.005 ? (
                    <p>
                      Per gli accantonamenti da ora metti da parte <strong>{formatEuro(done.monthlyAfter)} al mese</strong> (prima {formatEuro(done.monthlyBefore)}).
                    </p>
                  ) : done.refill.length === 0 ? (
                    <p className="text-muted-foreground">Le quote degli accantonamenti non cambiano.</p>
                  ) : null}
                  {done.refill.map(r => (
                    <p key={r.name}>Per {r.name} rimetti <strong>{formatEuro(r.amount)}</strong> entro il {dayMonth(r.due)}.</p>
                  ))}
                </div>
                <button onClick={close} className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors">
                  Chiudi
                </button>
              </div>
            ) : !data ? (
              <div className="flex flex-col gap-3 animate-pulse">
                <p className="text-sm text-muted-foreground">Caricamento…</p>
                {[1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-muted" />)}
              </div>
            ) : data.pots.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="text-4xl">🐷</span>
                <p className="text-sm text-muted-foreground">Non hai ancora salvadanai da cui prendere.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Scrivi quanto prendi da ogni salvadanaio. Se lo prendi dagli accantonamenti, Flusso ricalcola quanto mettere da parte ogni mese.
                </p>

                {unlinked && (
                  <div className="rounded-xl border px-3 py-2.5 text-xs flex flex-col gap-2">
                    <p>
                      Gli accantonamenti non sono collegati a un salvadanaio, quindi Flusso li cerca in tutti
                      (tranne quelli degli obiettivi), anche nel fondo emergenze. Dove li tieni?
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Salvadanaio degli accantonamenti"
                        value={linkPot} onChange={e => setLinkPot(e.target.value)}
                        className="flex-1 min-w-0 border-2 rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:border-primary"
                      >
                        <option value="">Scegli…</option>
                        {data.pots.filter(p => !goalOf(p.id)).map(p => <option key={p.id} value={p.id}>{p.emoji ?? "🐷"} {p.name}</option>)}
                      </select>
                      <button
                        type="button" onClick={linkSinkingPot} disabled={!linkPot || linking}
                        className="text-xs font-medium border rounded-lg px-3 py-2 hover:bg-muted/50 disabled:opacity-40 transition-colors shrink-0"
                      >
                        {linking ? "…" : "Collega"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {groups.filter(g => g.potIds.length > 1).map(g => (
                    <div key={g.potIds.join()} className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">Questi salvadanai tengono anche i soldi degli accantonamenti:</p>
                      {sinkingNotice(g)}
                    </div>
                  ))}
                  {sortedPots.map(potRow)}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="emergency-note" className="text-sm font-medium">A cosa ti servono? <span className="text-muted-foreground font-normal">(facoltativo)</span></label>
                  <input
                    id="emergency-note" type="text" maxLength={120} placeholder="Es. dentista, auto dal meccanico"
                    value={note} onChange={e => setNote(e.target.value)}
                    className="border-2 rounded-xl px-3 py-2 text-base bg-background focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                {total > 0 && !hasErrors && (
                  <div className="rounded-xl bg-muted/40 p-3 text-sm flex flex-col gap-1.5">
                    <div className="flex justify-between font-semibold">
                      <span>Prendi in tutto</span>
                      <span className="tabular-nums">{formatEuro(total)}</span>
                    </div>
                    {changed.length > 0 ? (
                      <>
                        <div className="flex justify-between gap-2 pt-1.5 border-t">
                          <span>Da mettere da parte ogni mese</span>
                          <span className="tabular-nums text-right">
                            {formatEuro(monthlyBefore)} → <strong>{formatEuro(monthlyAfter)}</strong>
                          </span>
                        </div>
                        {changed.flatMap(g => g.plan.items).map(it => (
                          <p key={it.id} className="text-xs text-muted-foreground">
                            {it.dueThisMonth
                              ? <>· {it.name}: da rimettere {formatEuro(it.taken)} entro il {dayMonth(it.due)}</>
                              : <>· {it.name}: {formatEuro(it.quotaAfter)} al mese {until(it.due)} (prima {formatEuro(it.quotaBefore)})</>}
                          </p>
                        ))}
                      </>
                    ) : groups.some(g => g.taken > 0) ? (
                      <p className="text-xs text-muted-foreground">Li prendi da quello che avevi messo da parte in più: le quote degli accantonamenti non cambiano.</p>
                    ) : null}
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={close} disabled={saving} className="flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors">
                    Annulla
                  </button>
                  <button
                    onClick={confirm}
                    disabled={saving || total <= 0 || hasErrors}
                    className="flex-1 bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Prelievo…" : total > 0 ? `Preleva ${formatEuro(total)}` : "Preleva"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
