"use client";

import { todayISO, toISODate } from "@/lib/dates";
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
      const res = await markRecurringAsPaid(overdue.item.id, overdue.amount, todayISO());
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
    // Le scadenze controllate sono del mese corrente (rate) o dell'anno corrente (voci
    // annuali): bastano i movimenti da gennaio. Prima si caricavano TUTTI i movimenti,
    // e oltre le 1000 righe Supabase ne restituiva una parte a caso → falsi "scaduta".
    const now = new Date();
    const since = toISODate(new Date(now.getFullYear(), Math.min(0, now.getMonth() - 1), 1));
    Promise.all([
      // Solo le Rate: le vecchie spese ricorrenti generiche non fanno più parte delle
      // previsioni (sono in Pianifica → "Da sistemare"), e avvisare per voci che l'utente
      // non trova da nessuna parte confonde.
      supabase.from("recurring_expenses")
        .select("id, name, secondary_name, tipologia, frequency, due_day, due_month, amount, amount_max, last_paid_date, next_due_date, match_keywords, category_id")
        .eq("user_id", userId).eq("tipologia", "fissa").not("debt_type", "is", null),
      supabase.from("transactions")
        .select("amount, date, description, merchant, category_id")
        .eq("user_id", userId).gte("date", since).lt("amount", 0),
    ]).then(([recRes, txRes]) => {
      // Come in Pianifica (effectiveKws): anche la transazione collegata a mano
      // ("Collega a transazione" → secondary_name) conta come parola chiave, altrimenti
      // una rata già pagata e collegata continuerebbe a risultare scaduta.
      type Row = OverdueCheckItem & { secondary_name: string | null };
      setItems(((recRes.data ?? []) as Row[]).map(({ secondary_name, ...it }) => ({
        ...it,
        match_keywords: secondary_name && !it.match_keywords.some(k => k.toLowerCase() === secondary_name.toLowerCase())
          ? [...it.match_keywords, secondary_name]
          : it.match_keywords,
      })));
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
            {overdue.length === 1
              ? <>La rata <strong>{overdue[0].item.name}</strong> risulta scaduta: l&apos;hai pagata?</>
              : <><strong>{overdue.length} rate</strong> risultano scadute: le hai pagate?</>}
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
