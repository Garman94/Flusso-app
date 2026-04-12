"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  formatEuro,
  calculateFinancialScore,
  calculateProjectedBalance,
  calculateTrendData,
  calculateMacroBreakdown,
  estimateGoalCompletion,
  type Transaction,
  type Goal,
  type DailyPoint,
} from "@/lib/calculations";
import { updateBalance } from "./balance-action";
import { updatePiggyBalance } from "./piggy-action";
import { updatePayDay } from "./pay-day-action";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Profile = { full_name: string | null; plan: string; balance: number; piggy_balance: number };

type Props = {
  profile: Profile;
  currentTxs: Transaction[];
  prevTxsAmounts: number[];
  goals: Goal[];
  year: number;
  month: number;
  totalTxCount: number;
  lastTxDate: string | null;
  payDay: number;     // 0 = calendar month, 1-28 = custom pay day
  periodFrom: string; // ISO date, start of current period
  periodTo: string;   // ISO date, end of current period
};

// ─── SVG Trend Chart ──────────────────────────────────────────────────────────
function TrendChart({ points, prevMonthNet }: { points: DailyPoint[]; prevMonthNet: number }) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Dati insufficienti per il grafico
      </div>
    );
  }

  const W = 600, H = 130;
  const PAD = { top: 16, right: 12, bottom: 24, left: 12 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = points.map(p => p.balance);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.15 || 100;
  const lo = minVal - padding;
  const hi = maxVal + padding;
  const range = hi - lo;

  const lastDay = points[points.length - 1].day;
  const firstBalance = points[0].balance;
  const lastBalance  = points[points.length - 1].balance;
  const isUp = lastBalance >= firstBalance;
  const lineColor = isUp ? "#22c55e" : "#ef4444";

  function toX(day: number) { return PAD.left + ((day - 1) / Math.max(lastDay - 1, 1)) * innerW; }
  function toY(val: number) { return PAD.top + (1 - (val - lo) / range) * innerH; }

  const polyPoints = points.map(p => `${toX(p.day).toFixed(1)},${toY(p.balance).toFixed(1)}`).join(" ");

  const daysInPrevMonth = 30;
  const prevDailyNet = prevMonthNet / daysInPrevMonth;
  const prevRefBalance = points[0].balance + prevDailyNet * lastDay;
  const prevY = toY(Math.max(lo, Math.min(hi, prevRefBalance)));

  const areaPoints = `${toX(1).toFixed(1)},${toY(lo).toFixed(1)} ${polyPoints} ${toX(lastDay).toFixed(1)},${toY(lo).toFixed(1)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
      <polygon points={areaPoints} fill={lineColor} fillOpacity={0.07} />
      <line
        x1={PAD.left} y1={prevY} x2={W - PAD.right} y2={prevY}
        stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="5 4"
      />
      <text x={W - PAD.right - 2} y={prevY - 4} fontSize={9} fill="currentColor" fillOpacity={0.4} textAnchor="end">
        mese scorso
      </text>
      <polyline
        points={polyPoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={toX(lastDay)} cy={toY(lastBalance)} r={4} fill={lineColor} />
      {[1, Math.round(lastDay / 2), lastDay].map(d => (
        <text key={d} x={toX(d)} y={H - 4} fontSize={9} fill="currentColor" fillOpacity={0.35} textAnchor="middle">
          {d}
        </text>
      ))}
    </svg>
  );
}

// ─── Balance editor ───────────────────────────────────────────────────────────
function BalanceEditor({ currentBalance }: { currentBalance: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentBalance.toFixed(2).replace(".", ","));
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateBalance(fd);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Saldo aggiornato!");
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mt-1"
        title="Aggiorna saldo reale"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Aggiorna saldo
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <input
        name="balance"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="border rounded-md px-2 py-1 text-sm bg-background w-32 focus:outline-none focus:ring-2 focus:ring-primary"
        autoFocus
      />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "..." : "Salva"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs border rounded px-3 py-1.5 hover:bg-muted/50 transition-colors"
      >
        ✕
      </button>
    </form>
  );
}

// ─── Piggy balance editor ─────────────────────────────────────────────────────
function PiggyBalanceEditor({ currentPiggy }: { currentPiggy: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentPiggy.toFixed(2).replace(".", ","));
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updatePiggyBalance(fd);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Salvadanaio aggiornato!");
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mt-1"
        title="Aggiorna saldo salvadanaio"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Aggiorna salvadanaio
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-1">
      <input
        name="piggy_balance"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="border rounded-md px-2 py-1 text-sm bg-background w-32 focus:outline-none focus:ring-2 focus:ring-primary"
        autoFocus
      />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "..." : "Salva"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs border rounded px-3 py-1.5 hover:bg-muted/50 transition-colors"
      >
        ✕
      </button>
    </form>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function adjustBizDay(date: Date): Date {
  const dow = date.getDay();
  if (dow === 6) return new Date(date.getTime() - 86_400_000);
  if (dow === 0) return new Date(date.getTime() + 86_400_000);
  return date;
}

function computePayPeriodPreview(day: number): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  let start = adjustBizDay(new Date(y, m, day));
  if (today < start) start = adjustBizDay(new Date(y, m - 1, day));
  const nextStart = adjustBizDay(new Date(start.getFullYear(), start.getMonth() + 1, day));
  const end = new Date(nextStart.getTime() - 86_400_000);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  const optsYear: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  return {
    from: start.toLocaleDateString("it-IT", opts),
    to:   end.toLocaleDateString("it-IT", optsYear),
  };
}

function SettingsModal({ payDay, onClose }: { payDay: number; onClose: () => void }) {
  const [type, setType] = useState<"solare" | "stipendio">(payDay > 0 ? "stipendio" : "solare");
  const [day, setDay] = useState(payDay > 0 ? payDay : 10);
  const [saving, setSaving] = useState(false);

  const preview = type === "stipendio" ? computePayPeriodPreview(day) : null;

  async function handleSave() {
    setSaving(true);
    const newPayDay = type === "solare" ? 0 : day;
    const res = await updatePayDay(newPayDay);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success("Impostazioni salvate!");
      onClose();
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Impostazioni dashboard</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-xs">Periodo mensile</p>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio" name="period"
              checked={type === "solare"}
              onChange={() => setType("solare")}
              className="mt-0.5 accent-primary"
            />
            <div>
              <p className="text-sm font-medium group-hover:text-primary transition-colors">Mese solare</p>
              <p className="text-xs text-muted-foreground">1° – ultimo giorno del mese</p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio" name="period"
              checked={type === "stipendio"}
              onChange={() => setType("stipendio")}
              className="mt-0.5 accent-primary"
            />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">Mese stipendio</p>
              <p className="text-xs text-muted-foreground">Il periodo parte dal giorno di accredito</p>
            </div>
          </label>

          {type === "stipendio" && (
            <div className="ml-6 flex flex-col gap-3 border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <label className="text-sm whitespace-nowrap">Giorno stipendio</label>
                <input
                  type="number" min={1} max={28}
                  value={day}
                  onChange={e => setDay(Math.max(1, Math.min(28, Number(e.target.value))))}
                  className="border rounded-md px-2 py-1 text-sm bg-background w-16 focus:outline-none focus:ring-2 focus:ring-primary text-center"
                />
                <span className="text-xs text-muted-foreground">del mese</span>
              </div>

              {preview && (
                <p className="text-xs text-primary font-medium">
                  Periodo attuale: {preview.from} → {preview.to}
                </p>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed">
                Se cade di <strong>sabato</strong> il periodo inizia il venerdì precedente.
                Se cade di <strong>domenica</strong> inizia il lunedì seguente.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onClose}
            className="border rounded-md px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard Client ────────────────────────────────────────────────────
export function DashboardClient({
  profile, currentTxs, prevTxsAmounts, goals,
  year, month, totalTxCount, lastTxDate,
  payDay, periodFrom, periodTo,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);

  const now = new Date();

  // ── Period-aware day calculations ──────────────────────────────────────────
  const periodStart = new Date(periodFrom + "T00:00:00");
  const periodEnd   = new Date(periodTo   + "T00:00:00");
  const totalDays   = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
  const daysPassed  = Math.max(1, Math.min(totalDays,
    Math.floor((now.getTime() - periodStart.getTime()) / 86_400_000) + 1
  ));
  const daysRemaining = Math.max(0, totalDays - daysPassed);

  // ── Period label ─────────────────────────────────────────────────────────
  const periodLabel = payDay > 0
    ? `${periodStart.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${periodEnd.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`
    : now.toLocaleString("it-IT", { month: "long", year: "numeric" });

  // ── Aggregates ────────────────────────────────────────────────────────────
  const income      = currentTxs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const expensesAbs = currentTxs.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const prevMonthNet = prevTxsAmounts.reduce((s, a) => s + a, 0);

  // ── Calculations ─────────────────────────────────────────────────────────
  const score     = calculateFinancialScore(income, expensesAbs);
  const projected = calculateProjectedBalance(profile.balance, expensesAbs, daysPassed, daysRemaining);
  const startDay  = payDay > 0 ? periodStart.getDate() : 1;
  const trendData = calculateTrendData(currentTxs, profile.balance, year, month, startDay);
  const macro     = calculateMacroBreakdown(currentTxs);
  const monthlySavings = income - expensesAbs;

  const hasTransactions    = currentTxs.length > 0;
  const hasAnyTransactions = totalTxCount > 0;
  const recentTxs          = [...currentTxs].reverse().slice(0, 5);
  const projectedDiff      = projected - profile.balance;

  return (
    <div className="flex flex-col gap-6">

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal payDay={payDay} onClose={() => setShowSettings(false)} />
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">
              Ciao{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
            </h1>
            <button
              onClick={() => setShowSettings(true)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
              title="Impostazioni dashboard"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">{periodLabel}</p>
        </div>
      </div>

      {/* ── Banner: nessun movimento questo periodo ── */}
      {hasAnyTransactions && !hasTransactions && lastTxDate && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 flex items-center gap-3 text-sm">
          <span className="text-yellow-500 text-lg shrink-0">⚠️</span>
          <p className="text-yellow-700 dark:text-yellow-400">
            Nessun movimento caricato per questo periodo.
            Ultimo movimento registrato:{" "}
            <strong>
              {new Date(lastTxDate + "T00:00:00").toLocaleDateString("it-IT", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </strong>.
          </p>
        </div>
      )}

      {/* ── Banner: transazioni non categorizzate ── */}
      {(() => {
        const uncategorized = currentTxs.filter(t => !t.category_id).length;
        if (uncategorized < 3) return null;
        const pct = Math.round((uncategorized / currentTxs.length) * 100);
        return (
          <Link
            href="/dashboard/transazioni"
            className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 flex items-center justify-between gap-3 text-sm hover:bg-orange-500/15 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="text-orange-500 text-lg shrink-0">🏷️</span>
              <p className="text-orange-700 dark:text-orange-400">
                <strong>{uncategorized} transazioni</strong> ({pct}%) non hanno una categoria —
                le categorie migliorano le analisi delle spese.
              </p>
            </div>
            <span className="text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap group-hover:underline">
              Categorizza →
            </span>
          </Link>
        );
      })()}

      {/* ── Hero: saldo + score ── */}
      <div className="rounded-xl border p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6 sm:items-center justify-between">
        {/* Saldo attuale */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo attuale</span>
          <span className="text-4xl font-bold tabular-nums">
            {formatEuro(profile.balance)}
          </span>
          <BalanceEditor currentBalance={profile.balance} />

          {/* Salvadanaio */}
          <div className="mt-3 pt-3 border-t flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo salvadanaio 🐷</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatEuro(profile.piggy_balance)}
            </span>
            <PiggyBalanceEditor currentPiggy={profile.piggy_balance} />
          </div>

          {/* Saldo previsto */}
          {hasTransactions && (
            <div className="mt-3 flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Previsto fine periodo</span>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-semibold tabular-nums ${projected < profile.balance ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                  {formatEuro(projected)}
                </span>
                <span className={`text-xs ${projectedDiff < 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                  {projectedDiff >= 0 ? "+" : ""}{formatEuro(projectedDiff)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Score */}
        {hasTransactions && (
          <div className={`rounded-xl px-4 py-3 sm:px-5 sm:py-4 flex flex-col gap-1 ${score.bgClass} w-full sm:min-w-[200px] sm:w-auto`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{score.dot}</span>
              <span className={`font-semibold text-sm ${score.colorClass}`}>{score.label}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-snug">{score.message}</p>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>Entrate: <strong className="text-green-600 dark:text-green-400">{formatEuro(income)}</strong></span>
              <span>Uscite: <strong className="text-red-500">{formatEuro(expensesAbs)}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* ── Trend chart ── */}
      {hasTransactions && trendData.length >= 2 && (
        <div className="rounded-xl border p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Andamento saldo — {periodLabel}</h2>
            <span className="text-xs text-muted-foreground">
              {trendData[trendData.length - 1].balance >= trendData[0].balance
                ? "↑ in crescita"
                : "↓ in calo"}
            </span>
          </div>
          <TrendChart points={trendData} prevMonthNet={prevMonthNet} />
        </div>
      )}

      {/* ── Empty state ── */}
      {!hasAnyTransactions && (
        <div className="rounded-xl border border-dashed p-8 sm:p-12 flex flex-col items-center gap-4 text-center">
          <span className="text-5xl">💸</span>
          <h2 className="font-semibold text-lg">Nessuna transazione ancora</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Vai alla pagina Transazioni per aggiungere i tuoi movimenti manualmente o caricare un file Excel della tua banca.
          </p>
          <Link href="/dashboard/transazioni" className="text-sm text-primary hover:underline">
            Vai alle transazioni →
          </Link>
        </div>
      )}

      {/* ── Bottom 2 columns ── */}
      {hasTransactions && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Macro breakdown + recenti */}
          <div className="rounded-xl border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Dove vanno i soldi</h2>
              <span className="text-xs text-muted-foreground">{periodLabel}</span>
            </div>
            {macro.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna uscita questo periodo.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {macro.map(mc => (
                  <div key={mc.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{mc.icon}</span>
                        <span className="font-medium">{mc.label}</span>
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{mc.pct.toFixed(0)}%</span>
                        <span className="font-semibold tabular-nums">{formatEuro(mc.total)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${mc.pct}%`, backgroundColor: mc.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {recentTxs.length > 0 && (
              <div className="mt-2 pt-4 border-t flex flex-col gap-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">Recenti</span>
                  <Link href="/dashboard/transazioni" className="text-xs text-primary hover:underline">Tutte →</Link>
                </div>
                {recentTxs.map((t, i) => (
                  <div key={t.id ?? i} className="flex items-center justify-between py-1.5 border-b last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{(t as any).categories?.icon ?? "📦"}</span>
                      <p className="text-sm truncate max-w-[160px]">{t.description || "Transazione"}</p>
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${Number(t.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Goals */}
          <div className="rounded-xl border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Obiettivi finanziari</h2>
              <Link href="/dashboard/obiettivi" className="text-xs text-primary hover:underline">Gestisci →</Link>
            </div>

            {goals.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="text-4xl">🎯</span>
                <p className="text-sm text-muted-foreground">Nessun obiettivo ancora.</p>
                <Link href="/dashboard/obiettivi" className="text-xs text-primary hover:underline">
                  Crea il primo obiettivo
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {goals.map(g => {
                  const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
                  const completed = pct >= 100;
                  const eta = estimateGoalCompletion(g, monthlySavings);
                  return (
                    <div key={g.id} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{g.icon}</span>
                          <span className="text-sm font-medium">{g.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${completed ? "bg-green-500" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatEuro(Number(g.current_amount))}</span>
                        {eta && !completed && <span className="text-primary">📅 {eta}</span>}
                        <span>{formatEuro(Number(g.target_amount))}</span>
                      </div>
                      {g.deadline && !completed && (
                        <p className="text-xs text-muted-foreground">
                          Scadenza: {new Date(g.deadline).toLocaleDateString("it-IT")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
