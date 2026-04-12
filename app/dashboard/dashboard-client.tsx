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
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Profile = { full_name: string | null; plan: string; balance: number };

type Props = {
  profile: Profile;
  currentTxs: Transaction[];
  prevTxsAmounts: number[];
  goals: Goal[];
  year: number;
  month: number;
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

  // Prev month reference: horizontal line at startBalance + prevMonthDailyNet * lastDay
  const daysInPrevMonth = 30;
  const prevDailyNet = prevMonthNet / daysInPrevMonth;
  const prevRefBalance = points[0].balance + prevDailyNet * lastDay;
  const prevY = toY(Math.max(lo, Math.min(hi, prevRefBalance)));

  // Area fill polygon
  const areaPoints = `${toX(1).toFixed(1)},${toY(lo).toFixed(1)} ${polyPoints} ${toX(lastDay).toFixed(1)},${toY(lo).toFixed(1)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
      {/* Area fill */}
      <polygon points={areaPoints} fill={lineColor} fillOpacity={0.07} />

      {/* Previous month reference dashed */}
      <line
        x1={PAD.left} y1={prevY} x2={W - PAD.right} y2={prevY}
        stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="5 4"
      />
      <text x={W - PAD.right - 2} y={prevY - 4} fontSize={9} fill="currentColor" fillOpacity={0.4} textAnchor="end">
        mese scorso
      </text>

      {/* Main line */}
      <polyline
        points={polyPoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Last point dot */}
      <circle cx={toX(lastDay)} cy={toY(lastBalance)} r={4} fill={lineColor} />

      {/* Day labels (first, mid, last) */}
      {[1, Math.round(lastDay / 2), lastDay].map(d => (
        <text key={d} x={toX(d)} y={H - 4} fontSize={9} fill="currentColor" fillOpacity={0.35} textAnchor="middle">
          {d}
        </text>
      ))}
    </svg>
  );
}

// ─── Balance edit form ────────────────────────────────────────────────────────
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

// ─── Main Dashboard Client ────────────────────────────────────────────────────
export function DashboardClient({ profile, currentTxs, prevTxsAmounts, goals, year, month }: Props) {
  // ── date helpers
  const now = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysPassed = now.getDate();
  const daysRemaining = daysInMonth - daysPassed;
  const monthName = now.toLocaleString("it-IT", { month: "long", year: "numeric" });

  // ── current month aggregates
  const income      = currentTxs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const expensesAbs = currentTxs.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  // ── prev month net (for chart reference line)
  const prevMonthNet = prevTxsAmounts.reduce((s, a) => s + a, 0);

  // ── calculations
  const score     = calculateFinancialScore(income, expensesAbs);
  const projected = calculateProjectedBalance(profile.balance, expensesAbs, daysPassed, daysRemaining);
  const trendData = calculateTrendData(currentTxs, profile.balance, year, month);
  const macro     = calculateMacroBreakdown(currentTxs);
  const monthlySavings = income - expensesAbs;

  const hasTransactions = currentTxs.length > 0;
  const recentTxs = [...currentTxs].reverse().slice(0, 5);

  const projectedDiff = projected - profile.balance;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Ciao{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5 capitalize">{monthName}</p>
        </div>
      </div>

      {/* ── Hero: saldo + score ── */}
      <div className="rounded-xl border p-6 flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
        {/* Saldo attuale */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo attuale</span>
          <span className="text-4xl font-bold tabular-nums">
            {formatEuro(profile.balance)}
          </span>
          <BalanceEditor currentBalance={profile.balance} />

          {/* Saldo previsto */}
          {hasTransactions && (
            <div className="mt-3 flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Previsto fine mese</span>
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
          <div className={`rounded-xl px-5 py-4 flex flex-col gap-1 ${score.bgClass} min-w-[200px]`}>
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
            <h2 className="font-semibold text-sm">Andamento saldo — {monthName}</h2>
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
      {!hasTransactions && (
        <div className="rounded-xl border border-dashed p-12 flex flex-col items-center gap-4 text-center">
          <span className="text-5xl">💸</span>
          <h2 className="font-semibold text-lg">Nessuna transazione questo mese</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Aggiungi la tua prima transazione manualmente o carica un file Excel della tua banca.
          </p>
        </div>
      )}

      {/* ── Bottom 2 columns ── */}
      {hasTransactions && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Macro category breakdown */}
          <div className="rounded-xl border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Dove vanno i soldi</h2>
              <span className="text-xs text-muted-foreground">{monthName}</span>
            </div>
            {macro.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna uscita questo mese.</p>
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

            {/* Transazioni recenti */}
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
                <Link href="/dashboard/obiettivi"
                  className="text-xs text-primary hover:underline">Crea il primo obiettivo</Link>
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
                        {eta && !completed && (
                          <span className="text-primary">📅 {eta}</span>
                        )}
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
