"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  calculateDailyBalanceProjection,
  evaluateBalanceHealth,
  findOverdueRecurring,
  type RecurringScheduleItem,
  type OverdueCheckItem,
  type BalanceProjectionDay,
} from "@/lib/calculations";
import { updateStartingBalance } from "./saldo-action";
import { toast } from "sonner";

type RecurringRow = RecurringScheduleItem & OverdueCheckItem;

type Tx = { amount: number; date: string; description?: string | null; merchant?: string | null; category_id?: string | null };

type Props = {
  userId: string;
  periodFrom: string;
  periodTo: string;
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

// ─── Setup: primo utilizzo ──────────────────────────────────────────────────
function SetupForm({ periodFrom, onSaved }: { periodFrom: string; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("starting_balance", value);
    fd.set("start_date", periodFrom);
    const res = await updateStartingBalance(fd);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success("Saldo iniziale impostato!");
      onSaved();
    }
    setSaving(false);
  }

  const fromLabel = new Date(periodFrom + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });

  return (
    <div className="rounded-xl border p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">📈</span>
        <h2 className="font-semibold">Saldo progressivo giornaliero</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Inserisci quanto avevi sul conto il <strong>{fromLabel}</strong> (inizio del periodo corrente):
        calcoleremo quanto dovresti avere oggi in base alle spese ricorrenti previste.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Es. 1200,00"
          inputMode="decimal"
          className="border rounded-md px-3 py-2 text-sm bg-background w-40 focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
        />
        <button
          type="submit"
          disabled={saving || !value}
          className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "..." : "Salva"}
        </button>
      </form>
    </div>
  );
}

// ─── Timeline SVG ────────────────────────────────────────────────────────────
function Timeline({ projection, todayIndex }: { projection: BalanceProjectionDay[]; todayIndex: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 600, H = 140, PAD = 8;
  const values = projection.map(d => d.balance);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i / Math.max(1, projection.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);

  const path = projection.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.balance).toFixed(1)}`).join(" ");

  const activeIdx = hover ?? todayIndex;
  const active = projection[activeIdx];

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-32 touch-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((relX - PAD) / (W - PAD * 2)) * (projection.length - 1));
          setHover(Math.max(0, Math.min(projection.length - 1, idx)));
        }}
      >
        {/* Zero line se il range attraversa lo zero */}
        {min < 0 && max > 0 && (
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-muted-foreground/30" strokeDasharray="3 3" />
        )}

        {/* Linea saldo previsto */}
        <path d={path} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Marker eventi (spese/entrate) */}
        {projection.map((d, i) =>
          d.events.map((ev, j) => (
            <circle
              key={`${i}-${j}`}
              cx={x(i)} cy={y(d.balance)} r={3.5}
              className={ev.amount < 0 ? "fill-red-500" : "fill-green-500"}
            />
          ))
        )}

        {/* Oggi */}
        <circle cx={x(todayIndex)} cy={y(projection[todayIndex]?.balance ?? 0)} r={5} className="fill-primary stroke-background" strokeWidth={2} />

        {/* Hover crosshair */}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="currentColor" className="text-muted-foreground/40" />
        )}
      </svg>

      {active && (
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-muted-foreground">
            {new Date(active.date + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
            {activeIdx === todayIndex && <span className="text-primary font-medium"> · oggi</span>}
          </span>
          <span className="font-semibold tabular-nums">{formatEuro(active.balance)}</span>
          {active.events.length > 0 && (
            <span className="text-muted-foreground truncate max-w-[50%]">
              {active.events.map(e => e.name).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function SaldoProgressivoCard({ userId, periodFrom, periodTo }: Props) {
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState<number | null>(null);
  const [items, setItems] = useState<RecurringRow[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("profiles").select("period_starting_balance, period_starting_balance_date").eq("id", userId).single(),
      supabase.from("recurring_expenses")
        .select("id, name, tipologia, frequency, custom_days, due_day, due_month, amount, amount_max, next_due_date, last_paid_date, match_keywords, category_id")
        .eq("user_id", userId),
      supabase.from("transactions")
        .select("amount, date, description, merchant, category_id")
        .eq("user_id", userId).gte("date", periodFrom).lte("date", periodTo),
    ]).then(([profileRes, recRes, txRes]) => {
      const pStart = profileRes.data?.period_starting_balance_date;
      setStartingBalance(
        pStart === periodFrom && profileRes.data?.period_starting_balance != null
          ? Number(profileRes.data.period_starting_balance)
          : null
      );
      setItems((recRes.data ?? []) as RecurringRow[]);
      setTxs((txRes.data ?? []) as Tx[]);
      setLoading(false);
    });
  }, [userId, periodFrom, periodTo, refreshKey]);

  const result = useMemo(() => {
    if (startingBalance == null) return null;
    const projection = calculateDailyBalanceProjection(startingBalance, items, periodFrom, periodTo);
    const iso = todayIso();
    let todayIndex = projection.findIndex(d => d.date === iso);
    if (todayIndex === -1) todayIndex = iso < periodFrom ? 0 : projection.length - 1;

    const expectedToday = projection[todayIndex]?.balance ?? startingBalance;
    const actualToday = startingBalance + txs
      .filter(t => t.date <= iso)
      .reduce((s, t) => s + Number(t.amount), 0);

    const health = evaluateBalanceHealth(actualToday, expectedToday);
    const overdue = findOverdueRecurring(items, txs);
    const overdueTotal = overdue.reduce((s, o) => s + o.amount, 0);

    return { projection, todayIndex, expectedToday, actualToday, health, overdueTotal };
  }, [startingBalance, items, txs, periodFrom, periodTo]);

  if (loading) {
    return (
      <div className="rounded-xl border p-5 animate-pulse">
        <div className="h-4 w-56 bg-muted rounded mb-4" />
        <div className="h-24 w-full bg-muted/60 rounded" />
      </div>
    );
  }

  if (startingBalance == null || !result) {
    return <SetupForm periodFrom={periodFrom} onSaved={() => setRefreshKey(k => k + 1)} />;
  }

  const { projection, todayIndex, expectedToday, actualToday, health, overdueTotal } = result;

  const statusStyle = {
    ahead: { text: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", label: "Sei in linea 👍" },
    green: { text: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", label: "Sei in linea 👍" },
    yellow: { text: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", label: `Attenzione: hai ${formatEuro(Math.abs(health.diff))} in meno del previsto` },
    red: { text: "text-red-500", bg: "bg-red-500/10", label: `Hai ${formatEuro(Math.abs(health.diff))} in meno del previsto — controlla le spese` },
  }[health.status];

  return (
    <div className="rounded-xl border p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">📈</span>
        <h2 className="font-semibold">Saldo progressivo giornaliero</h2>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Oggi dovresti avere circa</span>
          <span className="text-2xl font-bold tabular-nums" title={overdueTotal > 0 ? `Include ${formatEuro(overdueTotal)} di spese non ancora pagate` : undefined}>
            {formatEuro(expectedToday)}
          </span>
          {overdueTotal > 0 && (
            <span className="text-xs text-muted-foreground">Include {formatEuro(overdueTotal)} di spese non ancora pagate</span>
          )}
        </div>

        <div className={`rounded-lg px-3 py-2 text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.label}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Saldo reale attuale (calcolato): <strong className="text-foreground tabular-nums">{formatEuro(actualToday)}</strong>
      </div>

      <Timeline projection={projection} todayIndex={todayIndex} />

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> spesa prevista</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> entrata prevista</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> oggi</span>
      </div>
    </div>
  );
}
