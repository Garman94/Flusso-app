"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatEuro, findOverdueRecurring, type OverdueCheckItem, type OverdueResult } from "@/lib/calculations";
import { markRecurringAsPaid } from "./recurring-payment-actions";
import { toast } from "sonner";

type Tx = { amount: number; date: string; description?: string | null; merchant?: string | null; category_id?: string | null };

type Props = { userId: string };

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

function OverdueRow({ overdue, onPaid }: { overdue: OverdueResult; onPaid: () => void }) {
  const [isPending, startTransition] = useTransition();

  function handleMarkPaid() {
    startTransition(async () => {
      const res = await markRecurringAsPaid(overdue.item.id, overdue.amount, new Date().toISOString().split("T")[0]);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success(`"${overdue.item.name}" segnata come pagata`);
        onPaid();
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{overdue.item.name}</p>
        <p className="text-xs text-muted-foreground">Scaduta il {fmtDate(overdue.dueDate)} · {formatEuro(overdue.amount)}</p>
      </div>
      <button
        onClick={handleMarkPaid}
        disabled={isPending}
        className="text-xs font-medium bg-background border rounded-md px-3 py-1.5 hover:bg-muted/50 disabled:opacity-50 transition-colors shrink-0"
      >
        {isPending ? "..." : "Segna come pagata"}
      </button>
    </div>
  );
}

export function OverdueExpensesBanner({ userId }: Props) {
  const [items, setItems] = useState<OverdueCheckItem[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("recurring_expenses")
        .select("id, name, tipologia, frequency, due_day, due_month, amount, amount_max, last_paid_date, next_due_date, match_keywords, category_id")
        .eq("user_id", userId).eq("tipologia", "fissa"),
      supabase.from("transactions")
        .select("amount, date, description, merchant, category_id")
        .eq("user_id", userId),
    ]).then(([recRes, txRes]) => {
      setItems((recRes.data ?? []) as OverdueCheckItem[]);
      setTxs((txRes.data ?? []) as Tx[]);
      setLoading(false);
    });
  }, [userId, refreshKey]);

  if (loading) return null;

  const overdue = findOverdueRecurring(items, txs);
  if (overdue.length === 0) return null;

  const isRed = overdue.length >= 3;

  return (
    <div className={`rounded-xl border overflow-hidden ${isRed ? "border-red-500/40" : "border-orange-500/40"}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-left transition-colors ${isRed ? "bg-red-500/10 hover:bg-red-500/15" : "bg-orange-500/10 hover:bg-orange-500/15"}`}
      >
        <span className="flex items-center gap-2">
          <span className="text-lg shrink-0">⚠️</span>
          <span className={isRed ? "text-red-600 dark:text-red-400" : "text-orange-700 dark:text-orange-400"}>
            Hai <strong>{overdue.length}</strong> {overdue.length === 1 ? "spesa scaduta" : "spese scadute"} non ancora {overdue.length === 1 ? "segnata" : "segnate"} come pagat{overdue.length === 1 ? "a" : "e"}
          </span>
        </span>
        <span className="text-muted-foreground text-xs shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="bg-background divide-y">
          {overdue.map(o => (
            <OverdueRow key={o.item.id} overdue={o} onPaid={() => setRefreshKey(k => k + 1)} />
          ))}
        </div>
      )}
    </div>
  );
}
