"use client";

import { todayISO } from "@/lib/dates";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatEuro,
  aggregateExpectedIncome,
  hasIncomeInfo,
  normalizeMonthlyIncome,
  aggregateSinkingFunds,
  sinkingFundInput,
  computeDebtProgress,
  isTransferCategory,
  projectPeriodEnd,
  type IncomeInfo,
} from "@/lib/calculations";
import { parseAmount } from "@/lib/import-parse";
import { isFixedExpense, planStatus, splitPlan, type PlanItem } from "@/lib/fixed-expenses";
import { flowOf, isSpending, moneyTotals } from "@/lib/money";
import { updateStartingBalance } from "./saldo-action";
import { EmergencyButton } from "./emergency-button";
import { toast } from "sonner";
import type { HeroData, HeroTx } from "./hero-data";
import { periodEndLabel, shortDay, spendable, type Spendable } from "@/lib/spendable";

// Card principale della dashboard. Tre domande, in quest'ordine:
//   1. quanto ho oggi?            → Saldo di oggi
//   2. quanto avrò a fine periodo? → saldo di oggi + entrate ancora attese − spese ancora previste
//      (le spese fisse e le rate ancora da pagare si tolgono a parte: vedi splitPlan)
//   3. come sto andando?          → barre "speso X di Y" e "ricevuto X di Y"
// Prima c'erano 9 numeri in tre righe, e "Saldo fine mese stimato" era in realtà
// entrate previste − spese previste (il risparmio del mese, non un saldo): confrontato col
// saldo reale dava differenze senza senso. Vedi projectPeriodEnd in lib/calculations.ts.

type Tx = HeroTx;

type Props = {
  userId: string;
  periodFrom: string;
  periodTo: string;
  /** giorno di paga (0 = mese solare): per l'etichetta "Fino al prossimo stipendio" */
  payDay: number;
  piggyBalance: number;
  /** letti dal server (hero-data.ts): la card non fa richieste, dopo un salvataggio router.refresh() */
  data: HeroData;
  /** movimenti del periodo, gli stessi del resto della dashboard */
  periodTxs: HeroTx[];
};

type ExpandKey = "saldo" | "fine" | "spese" | "entrate";

const isTransfer = (t: Tx) => isTransferCategory(t.categories?.name);

// "26 nov" uguale su server e browser (la card ora arriva già pronta dal server)
const fmtDay = shortDay;

// ─── Setup: primo utilizzo / correzione ─────────────────────────────────────
// L'utente inserisce il saldo che ha OGGI sul conto. Per ancorare la proiezione
// all'inizio del periodo sottraiamo le transazioni gia' registrate nel periodo
// (periodFrom → oggi), cosi' `period_starting_balance` resta il saldo a periodFrom.
// Nei periodi successivi il saldo si riporta da solo (rollBalance): va reinserito
// solo per correggerlo.
function SetupForm({
  periodFrom,
  txSumInPeriod,
  initialValue,
  onSaved,
  onCancel,
}: {
  periodFrom: string;
  txSumInPeriod: number;
  initialValue?: number;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(
    initialValue != null ? initialValue.toFixed(2).replace(".", ",") : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const today = parseAmount(value);
    if (today === null) {
      toast.error("Importo non valido.");
      return;
    }
    setSaving(true);
    const atPeriodStart = today - txSumInPeriod;
    const fd = new FormData();
    fd.set("starting_balance", String(atPeriodStart));
    fd.set("start_date", periodFrom);
    const res = await updateStartingBalance(fd);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success("Saldo aggiornato!");
      onSaved();
    }
    setSaving(false);
  }

  return (
    <div data-tour="hero" className="rounded-xl border p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">🏦</span>
        <h2 className="font-semibold">Quanto hai oggi sul conto?</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Guarda l&apos;app della banca e scrivi il saldo di oggi. Basta farlo una volta:
        da lì in poi Flusso lo aggiorna da solo con i movimenti che carichi.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Es. 1.913,00"
          inputMode="decimal"
          aria-label="Saldo di oggi sul conto"
          className="min-h-11 border rounded-md px-3 py-2 text-base sm:text-sm bg-background w-40 focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
        />
        <button
          type="submit"
          disabled={saving || !value}
          className="min-h-11 text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "..." : "Salva"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-11 text-sm text-muted-foreground px-2 hover:text-foreground">
            Annulla
          </button>
        )}
      </form>
    </div>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5}
      className={`text-muted-foreground transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function TxRow({ t }: { t: Tx }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDay(t.date)}</span>
        <span className="text-xs truncate">{t.description || t.merchant || "Transazione"}</span>
      </div>
      <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ml-3 ${Number(t.amount) < 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
        {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
      </span>
    </div>
  );
}

function TxListPanel({ txs, emptyLabel }: { txs: Tx[]; emptyLabel: string }) {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden max-h-64 overflow-y-auto">
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3 py-2">{emptyLabel}</p>
      ) : sorted.map((t, i) => <TxRow key={i} t={t} />)}
    </div>
  );
}

function Line({ label, value, strong, className = "" }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${className}`}>
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

/** Barra "fatto X di Y previsti", toccabile per aprire il dettaglio. */
function ProgressStat({
  label, done, planned, color, hint, open, onClick,
}: {
  label: string; done: number; planned: number; color: "red" | "green";
  hint: React.ReactNode; open: boolean; onClick: () => void;
}) {
  const pct = planned > 0 ? Math.min(100, (done / planned) * 100) : 0;
  const over = planned > 0 && done > planned;
  const bar = color === "red" ? (over ? "bg-red-600" : "bg-red-400") : "bg-green-500";
  return (
    <button onClick={onClick} className="flex flex-col gap-1.5 text-left w-full hover:opacity-90 transition-opacity">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium flex items-center gap-1">{label} <Chevron open={open} /></span>
        <span className="text-sm tabular-nums">
          <strong>{formatEuro(done)}</strong>
          {planned > 0 && <span className="text-muted-foreground"> di {formatEuro(planned)}</span>}
        </span>
      </div>
      {planned > 0 && (
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

/**
 * Il numero grande: quanto si può spendere ancora fino alla fine del periodo (lib/spendable.ts).
 * Frasi calme anche quando i conti non tornano: dicono cosa fare, non solo che va male.
 */
function SpendableHeadline({ s, committed }: { s: Spendable; committed: number }) {
  if (s.kind === "ok") {
    return (
      <>
        <span className="text-sm text-muted-foreground">Puoi spendere ancora</span>
        <span className="text-4xl sm:text-5xl font-bold tabular-nums leading-tight">{formatEuro(s.amount)}</span>
        <span className="text-sm text-muted-foreground">
          {s.days > 1
            ? <>circa <strong className="text-foreground">{formatEuro(s.perDay)}</strong> al giorno per {s.days} giorni</>
            : <>oggi è l&apos;ultimo giorno del periodo</>}
        </span>
        {s.capped && (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            È quello che resta sul conto: il budget ti lascerebbe di più, ma contando le entrate in arrivo
            {committed > 0 ? " e le spese fisse ancora da pagare" : ""} non ci sono altri soldi.
          </span>
        )}
      </>
    );
  }
  if (s.kind === "over") {
    return (
      <>
        <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-tight text-amber-700 dark:text-amber-400">
          Hai superato il budget di {formatEuro(s.amount)}
        </span>
        <span className="text-sm text-muted-foreground">
          {s.days > 1 ? `Per i prossimi ${s.days} giorni conviene stringere.` : "Oggi è l'ultimo giorno del periodo: domani si riparte."}
          {committed > 0 && <> Restano da pagare spese fisse e rate per {formatEuro(committed)}.</>}
        </span>
      </>
    );
  }
  if (s.kind === "short") {
    return (
      <>
        <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-tight text-amber-700 dark:text-amber-400">
          Mancano {formatEuro(s.amount)}
        </span>
        <span className="text-sm text-muted-foreground">
          per le spese fisse e le rate ancora da pagare, contando le entrate in arrivo. Per le altre spese non resta niente:
          se puoi, rimanda quelle che possono aspettare.
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-lg font-semibold">Quanto puoi spendere ancora?</span>
      <span className="text-sm text-muted-foreground">
        Imposta un budget per le spese di tutti i giorni (spesa, benzina, ristoranti): Flusso ti dirà quanto puoi spendere fino alla fine del periodo e quanto al giorno.
      </span>
      <Link href="/dashboard/smart?v=budget" className="min-h-11 inline-flex items-center self-start text-sm font-medium text-primary hover:underline">
        Imposta il budget →
      </Link>
    </>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function BalanceHeroCard({ userId, periodFrom, periodTo, payDay, piggyBalance, data, periodTxs }: Props) {
  const router = useRouter();
  const { startingBalance, carriedFrom, items, budgetTotal, ownerIncome, membersIncome, accounts, accountStart } = data;
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<ExpandKey | null>(null);

  function toggle(key: ExpandKey) {
    setExpanded(k => k === key ? null : key);
  }

  const iso = todayISO();

  const txSumToToday = useMemo(
    () => periodTxs.filter(t => t.date <= iso).reduce((s, t) => s + Number(t.amount), 0),
    [periodTxs, iso]
  );

  const result = useMemo(() => {
    if (startingBalance == null) return null;

    // ── Effettivi (periodo corrente) ──
    // Giroconti fuori; i rimborsi (entrate in una categoria di spesa, es. gli amici che ridanno
    // la cena o il prelievo dagli accantonamenti) abbassano le spese: vedi lib/money.ts.
    const spendableTxs = periodTxs.filter(t => !isTransfer(t));
    const expenseTxs = spendableTxs.filter(t => isSpending(t));
    const incomeTxs  = spendableTxs.filter(t => !isSpending(t));
    const { income, expenses: expensesAbs } = moneyTotals(periodTxs);
    const actualToday = startingBalance + txSumToToday;

    // ── Contributo netto per componente (entrate reali - spese reali, periodo corrente) ──
    const memberMap = new Map<string, { name: string; color: string; income: number; expense: number }>();
    membersIncome.forEach(m => memberMap.set(m.id, { name: m.name, color: m.color, income: 0, expense: 0 }));
    for (const t of spendableTxs) {
      const key = t.member_id ?? "__none__";
      if (!memberMap.has(key)) memberMap.set(key, { name: "Non assegnato", color: "#94a3b8", income: 0, expense: 0 });
      const entry = memberMap.get(key)!;
      const f = flowOf(t);
      entry.income += f.income;
      entry.expense += f.expense;
    }
    const memberBreakdown = Array.from(memberMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .filter(m => Math.abs(m.income) > 0.005 || Math.abs(m.expense) > 0.005);

    // ── Previsti: reddito dall'anagrafica (mese in cui inizia il periodo) ──
    const periodMonth = new Date(periodFrom + "T00:00:00").getMonth() + 1;

    // Rate in corso (esclude quelle non ancora iniziate e quelle già terminate) con una
    // scadenza in questo periodo: una rata partita da poco può avere la prima nel periodo dopo.
    const rateItems = items
      .filter(it => it.debt_type && it.debt_total_amount && it.debt_start_date)
      .map(it => ({
        item: it,
        progress: computeDebtProgress({ totalAmount: it.debt_total_amount!, monthlyAmount: it.amount, startDate: it.debt_start_date! }),
        status: planStatus(it as PlanItem, periodTxs, periodFrom, periodTo, iso),
      }))
      .filter(r => r.progress.status === "active" && r.status.state !== "not-due");
    const rateMonthly = rateItems.reduce((s, r) => s + r.item.amount, 0);

    // Spese fisse (affitto, abbonamenti, bollette) e rate: per ognuna si sa se in questo
    // periodo è già stata pagata. Quelle ancora da pagare si tolgono a parte dalla stima, così
    // "puoi ancora spendere" non comprende l'affitto che deve ancora partire.
    const fixedStatuses = items.filter(isFixedExpense)
      .map(it => planStatus(it as PlanItem, periodTxs, periodFrom, periodTo, iso))
      .filter(st => st.state !== "not-due");
    const rateStatuses = rateItems.map(r => r.status);
    const plan = splitPlan([...fixedStatuses, ...rateStatuses], t => !isTransfer(t));
    const fixedMonthly = fixedStatuses.reduce((s, st) => s + st.expected, 0);

    // Spese previste = spese fisse + rate in corso + quota mensile accantonamenti + budget
    // per categoria (Pianifica).
    const sinkingInputs = items
      .filter(it => it.next_due_date && it.saving_start_date)
      .map(sinkingFundInput);
    const sinkingMonthly = aggregateSinkingFunds(sinkingInputs, piggyBalance).this_month_total;
    const spesePreviste = fixedMonthly + rateMonthly + sinkingMonthly + budgetTotal;
    // Il resto delle spese previste, quelle "da spendere": budget, accantonamenti e le voci
    // di cui Flusso non può verificare il pagamento.
    const flexiblePlanned = budgetTotal + sinkingMonthly + plan.flexible;

    // Se il titolare si e' identificato come Componente, il suo reddito e' li' (evita di sommarlo due volte).
    const hasOwnerMember = membersIncome.some(m => m.is_owner);
    const entratePreviste = aggregateExpectedIncome(hasOwnerMember ? null : ownerIncome, membersIncome, periodMonth);

    const projection = projectPeriodEnd({
      balanceToday: actualToday,
      incomeSoFar: income,
      expensesSoFar: expensesAbs - plan.paidSpent,
      expectedIncome: entratePreviste,
      expectedExpenses: flexiblePlanned,
      committedRemaining: plan.remaining,
    });

    return {
      income, expensesAbs, incomeTxs, expenseTxs, memberBreakdown, actualToday,
      rateMonthly, rateItems, sinkingMonthly, spesePreviste, entratePreviste,
      fixedMonthly, fixedStatuses, flexiblePlanned,
      projection, periodMonth, hasOwnerMember,
    };
  }, [startingBalance, items, periodTxs, budgetTotal, ownerIncome, membersIncome, piggyBalance, txSumToToday, periodFrom, periodTo, iso]);

  if (startingBalance == null || !result) {
    return (
      <SetupForm
        periodFrom={periodFrom}
        txSumInPeriod={txSumToToday}
        onSaved={() => router.refresh()}
      />
    );
  }

  const {
    income, expensesAbs, incomeTxs, expenseTxs, memberBreakdown, actualToday,
    rateMonthly, rateItems, sinkingMonthly, spesePreviste, entratePreviste,
    fixedMonthly, fixedStatuses, flexiblePlanned,
    projection, periodMonth, hasOwnerMember,
  } = result;

  if (editing) {
    return (
      <SetupForm
        periodFrom={periodFrom}
        txSumInPeriod={txSumToToday}
        initialValue={actualToday}
        onSaved={() => { setEditing(false); router.refresh(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const hasPlan = spesePreviste > 0;
  const hasIncome = entratePreviste > 0;
  const incomeSources = [
    ...(hasOwnerMember ? [] : [{ name: "Tu", amount: hasIncomeInfo(ownerIncome) ? normalizeMonthlyIncome(ownerIncome, periodMonth) : 0 }]),
    ...membersIncome
      .filter(m => hasIncomeInfo(m))
      .map(m => ({ name: m.is_owner ? `${m.name} (tu)` : m.name, amount: normalizeMonthlyIncome(m, periodMonth) })),
  ].filter(s => s.amount > 0);

  const committed = projection.committedRemaining;
  const spend = spendable({
    flexiblePlanned,
    leftToSpend: projection.leftToSpend,
    endBalance: projection.endBalance,
    today: iso,
    periodTo,
  });
  // Sotto la barra delle spese: il numero grande dice già quanto resta, qui le spese fisse.
  const spendHint = !hasPlan
    ? <Link href="/dashboard/smart?v=spese-fisse" onClick={e => e.stopPropagation()} className="text-primary hover:underline">Aggiungi le spese fisse (affitto, bollette, abbonamenti) per avere una previsione →</Link>
    : committed > 0
      ? <>Spese fisse e rate ancora da pagare: <strong className="text-foreground">{formatEuro(committed)}</strong>{flexiblePlanned > 0 ? " (già tolte da quanto puoi spendere)" : ""}</>
      : <>Spese fisse e rate pagate ✓</>;

  const incomeHint = !hasIncome
    ? <Link href="/dashboard/account" onClick={e => e.stopPropagation()} className="text-primary hover:underline">Indica il tuo stipendio per la previsione →</Link>
    : projection.remainingIncome > 0
      ? <>Ancora attese: {formatEuro(projection.remainingIncome)}</>
      : <>Entrate previste arrivate ✓</>;

  return (
    <div data-tour="hero" className="rounded-xl border p-4 sm:p-6 flex flex-col gap-5">

      {/* 1 — Quanto puoi spendere ancora */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{periodEndLabel(payDay, periodTo)}</span>
        <SpendableHeadline s={spend} committed={committed} />
      </div>

      {/* 2 — Saldo di oggi · a fine periodo circa */}
      <div className="pt-3 border-t flex flex-wrap items-center gap-x-5 gap-y-0">
        <button onClick={() => toggle("saldo")} aria-expanded={expanded === "saldo"} className="min-h-11 inline-flex items-center gap-1.5 text-left hover:opacity-80 transition-opacity">
          <span className="text-sm text-muted-foreground">Saldo di oggi</span>
          <span className="text-base font-semibold tabular-nums">{formatEuro(actualToday)}</span>
          <Chevron open={expanded === "saldo"} />
        </button>
        {(hasPlan || hasIncome) && (
          <button onClick={() => toggle("fine")} aria-expanded={expanded === "fine"} className="min-h-11 inline-flex items-center gap-1.5 text-left hover:opacity-80 transition-opacity">
            <span className="text-sm text-muted-foreground">A fine periodo circa</span>
            <span className={`text-base font-semibold tabular-nums ${projection.endBalance < 0 ? "text-red-500" : ""}`}>{formatEuro(projection.endBalance)}</span>
            <Chevron open={expanded === "fine"} />
          </button>
        )}
        {accounts.length ? (
          <Link href="/dashboard/conti" className="min-h-11 inline-flex items-center text-xs text-muted-foreground hover:text-foreground underline ml-auto">
            Quadra con la banca
          </Link>
        ) : (
          <button onClick={() => setEditing(true)} className="min-h-11 inline-flex items-center text-xs text-muted-foreground hover:text-foreground underline ml-auto">
            Correggi il saldo
          </button>
        )}
      </div>
      {!hasPlan && !hasIncome && (
        <p className="text-xs text-muted-foreground -mt-3">
          Per sapere quanto avrai a fine periodo, indica il tuo{" "}
          <Link href="/dashboard/account" className="text-primary hover:underline">stipendio</Link>{" "}
          e{" "}
          <Link href="/dashboard/smart?v=spese-fisse" className="text-primary hover:underline">le spese fisse</Link>.
        </p>
      )}
      {carriedFrom && expanded !== "saldo" && (
        <p className="text-[11px] text-muted-foreground -mt-4">
          Saldo aggiornato da solo con i movimenti dal {fmtDay(carriedFrom)}. Non torna con la banca? Tocca &quot;Correggi il saldo&quot;.
        </p>
      )}

      {expanded === "saldo" && (
        <div className="flex flex-col gap-2 -mt-2">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs">
            <Line label={`Saldo a inizio periodo (${fmtDay(periodFrom)})`} value={formatEuro(startingBalance)} />
            <Line label="+ movimenti fino a oggi" value={formatEuro(txSumToToday)} />
            <Line label="= Saldo di oggi" value={formatEuro(actualToday)} strong className="pt-1 border-t" />
            {accounts.length > 0 && (
              <div className="flex flex-col gap-1 pt-2 mt-1 border-t">
                {accounts.map(a => (
                  <Line key={a.id} label={`🏦 ${a.name}`}
                    value={formatEuro((accountStart[a.id] ?? 0) + periodTxs.filter(t => t.account_id === a.id && t.date <= iso).reduce((s, t) => s + Number(t.amount), 0))} />
                ))}
                {(() => {
                  const loose = periodTxs.filter(t => !t.account_id && t.date <= iso).length;
                  return loose > 0 ? (
                    <p className="text-amber-600 dark:text-amber-400">
                      {loose} {loose === 1 ? "movimento" : "movimenti"} di questo periodo senza conto: il totale potrebbe non tornare.{" "}
                      <Link href="/dashboard/conti" className="underline">Assegnali</Link>
                    </p>
                  ) : null;
                })()}
                <Link href="/dashboard/conti" className="text-primary hover:underline pt-1">I tuoi conti →</Link>
              </div>
            )}
            {accounts.length === 0 && (
              <Link href="/dashboard/conti" className="text-primary hover:underline pt-1">Hai più di un conto (tuo, del partner)? Tieni il saldo di ognuno →</Link>
            )}
            {carriedFrom && (
              <p className="text-muted-foreground pt-1">
                Il saldo a inizio periodo è calcolato dall&apos;ultimo che hai inserito ({fmtDay(carriedFrom)}) più i movimenti caricati da allora.
              </p>
            )}
          </div>
          {memberBreakdown.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground uppercase tracking-wide text-[10px]">
                Contributo netto per componente (questo periodo)
              </span>
              {memberBreakdown.map(m => {
                const net = m.income - m.expense;
                return (
                  <div key={m.id} className="flex flex-col gap-0.5 pt-1.5 border-t first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0 font-medium text-foreground">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                        <span className="truncate">{m.name}</span>
                      </span>
                      <span className={`font-semibold tabular-nums shrink-0 ${net >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                        {net >= 0 ? "+" : ""}{formatEuro(net)}
                      </span>
                    </div>
                    <span className="text-muted-foreground pl-3.5">
                      +{formatEuro(m.income)} entrate · -{formatEuro(m.expense)} spese
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <TxListPanel txs={periodTxs.filter(t => t.date <= iso)} emptyLabel="Nessun movimento registrato fino a oggi." />
        </div>
      )}

      {/* Dettaglio della stima di fine periodo */}
        {expanded === "fine" && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs">
            <Line label="Saldo di oggi" value={formatEuro(actualToday)} />
            <Line label="+ entrate ancora attese" value={formatEuro(projection.remainingIncome)} />
            {committed > 0 ? (
              <>
                <Line label="− spese fisse e rate da pagare" value={formatEuro(committed)} />
                <Line label="− altre spese previste" value={formatEuro(projection.remainingExpenses - committed)} />
              </>
            ) : (
              <Line label="− spese ancora previste" value={formatEuro(projection.remainingExpenses)} />
            )}
            <Line label="= Stima a fine periodo" value={formatEuro(projection.endBalance)} strong className="pt-1 border-t" />
            {hasPlan && hasIncome && (
              <p className="text-muted-foreground pt-1">
                In tutto il periodo prevedi di mettere da parte {formatEuro(entratePreviste - spesePreviste)} (entrate previste − spese previste).
              </p>
            )}
          </div>
        )}

      {/* 3 — Come stai andando */}
      <div className="flex flex-col gap-4">
        <ProgressStat
          label="Spese" done={expensesAbs} planned={spesePreviste} color="red"
          hint={spendHint} open={expanded === "spese"} onClick={() => toggle("spese")}
        />
        {expanded === "spese" && (
          <div className="flex flex-col gap-2 -mt-2">
            {hasPlan && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Da dove vengono le spese previste</span>
                {fixedMonthly > 0 && (
                  <>
                    <Line label="Spese fisse" value={formatEuro(fixedMonthly)} />
                    {fixedStatuses.map(st => (
                      <Line key={st.item.id} label={`· ${st.item.name}${st.state === "paid" ? " ✓" : ""}`} value={formatEuro(st.expected)} className="pl-2" />
                    ))}
                  </>
                )}
                <Line label="Rate in corso" value={formatEuro(rateMonthly)} className={fixedMonthly > 0 ? "pt-1 border-t" : ""} />
                {rateItems.map(({ item }) => (
                  <Line key={item.id} label={`· ${item.name}`} value={formatEuro(item.amount)} className="pl-2" />
                ))}
                {sinkingMonthly > 0 && <Line label="Spese dell'anno (quota del mese)" value={formatEuro(sinkingMonthly)} className="pt-1 border-t" />}
                <Line label="Budget per categoria" value={formatEuro(budgetTotal)} className="pt-1 border-t" />
                <Line label="= Spese previste" value={formatEuro(spesePreviste)} strong className="pt-1 border-t" />
                <Link href="/dashboard/smart" className="text-primary hover:underline pt-1">Modifica in Pianifica →</Link>
              </div>
            )}
            <TxListPanel txs={expenseTxs} emptyLabel="Nessuna spesa questo periodo." />
          </div>
        )}

        <ProgressStat
          label="Entrate" done={income} planned={entratePreviste} color="green"
          hint={incomeHint} open={expanded === "entrate"} onClick={() => toggle("entrate")}
        />
        {expanded === "entrate" && (
          <div className="flex flex-col gap-2 -mt-2">
            {incomeSources.length > 0 && (
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <span className="block text-muted-foreground uppercase tracking-wide text-[10px] px-3 pt-2">Entrate previste</span>
                {incomeSources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-xs">
                    <span>{s.name}</span>
                    <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">{formatEuro(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <TxListPanel txs={incomeTxs} emptyLabel="Nessuna entrata questo periodo." />
          </div>
        )}
      </div>

      {/* Salvadanai, con dentro il tasto Emergenza */}
      <div data-tour="salvadanai-emergenza" className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center justify-between gap-3">
        <Link href="/dashboard/salvadanai" className="min-h-11 flex flex-col justify-center gap-0.5 group min-w-0">
          <span className="text-xs text-muted-foreground">Messi da parte nei <span className="whitespace-nowrap">salvadanai 🐷</span></span>
          <span className="text-lg font-semibold tabular-nums">
            {formatEuro(piggyBalance)}{" "}
            <span className="text-xs font-normal text-muted-foreground group-hover:text-foreground transition-colors">Apri →</span>
          </span>
        </Link>
        <EmergencyButton userId={userId} onDone={() => router.refresh()} />
      </div>
    </div>
  );
}
