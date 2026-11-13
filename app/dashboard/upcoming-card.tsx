"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatEuro } from "@/lib/calculations";
import { todayISO } from "@/lib/dates";
import { shortDay } from "@/lib/spendable";
import { inDaysLabel, upcomingItems, UPCOMING_MAX, type UpcomingItem, type UpcomingRow } from "@/lib/upcoming";
import type { PlanTx } from "@/lib/fixed-expenses";
import { useDemoGuard } from "@/components/demo-context";
import { markRecurringAsPaid } from "./recurring-payment-actions";
import { track } from "@/lib/track";

// "In arrivo": spese fisse, rate e spese dell'anno di questo periodo, al massimo 4, prima
// quelle che chiedono attenzione. Usa i dati già letti per la card del saldo (hero-data.ts):
// nessuna richiesta in più. Senza voci la card non compare.

function StateLabel({ r }: { r: UpcomingRow }) {
  if (r.state === "paid") return <span className="text-green-600 dark:text-green-400">✅ Pagata</span>;
  if (r.state === "upcoming") {
    const when = inDaysLabel(r.daysTo);
    return <span className="text-muted-foreground">⏳ {when ?? "in questo periodo"}</span>;
  }
  if (r.state === "missing") {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        {r.kind === "sinking" ? "⚠️ Scaduta" : "⚠️ Non trovata nei movimenti"}
      </span>
    );
  }
  return <span className="text-muted-foreground">❔ Pagata?</span>;
}

export function UpcomingCard({
  items, txs, periodFrom, periodTo,
}: {
  items: UpcomingItem[];
  txs: PlanTx[];
  periodFrom: string;
  periodTo: string;
}) {
  const router = useRouter();
  const guard = useDemoGuard();
  const [saving, setSaving] = useState<string | null>(null);
  const today = todayISO();
  const rows = useMemo(
    () => upcomingItems(items, txs, periodFrom, periodTo, today),
    [items, txs, periodFrom, periodTo, today],
  );
  if (rows.length === 0) return null;
  const shown = rows.slice(0, UPCOMING_MAX);
  const toPay = rows.filter(r => r.state !== "paid").reduce((s, r) => s + r.amount, 0);

  async function markPaid(r: UpcomingRow) {
    if (guard()) return;
    setSaving(r.id);
    const res = await markRecurringAsPaid(r.id, r.amount, today);
    setSaving(null);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`${r.name}: segnata come pagata`);
    track("upcoming_marked_paid", { kind: r.kind, state: r.state });
    router.refresh();
  }

  return (
    <section data-tour="upcoming" className="rounded-xl border p-4 sm:p-5 flex flex-col gap-2" aria-labelledby="upcoming-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="upcoming-title" className="font-semibold">In arrivo</h2>
        {toPay > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">ancora da pagare {formatEuro(toPay)}</span>
        )}
      </div>
      <ul className="flex flex-col">
        {shown.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 min-h-11">
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">
                {r.name}
                {r.kind === "rate" && <span className="text-xs font-normal text-muted-foreground"> · rata</span>}
                {r.kind === "sinking" && <span className="text-xs font-normal text-muted-foreground"> · spesa dell&apos;anno</span>}
              </span>
              <span className="text-xs">
                {r.date && <span className="text-muted-foreground">{shortDay(r.date)} · </span>}
                <StateLabel r={r} />
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm tabular-nums">{formatEuro(r.amount)}</span>
              {r.kind !== "sinking" && (r.state === "missing" || r.state === "unverifiable") && (
                <button
                  onClick={() => markPaid(r)}
                  disabled={saving === r.id}
                  className="min-h-11 px-3 rounded-md border text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  {saving === r.id ? "…" : "L'ho pagata"}
                </button>
              )}
              {r.kind === "sinking" && r.state === "missing" && (
                <Link
                  href="/dashboard/smart?v=accantonamenti"
                  className="min-h-11 px-3 inline-flex items-center rounded-md border text-xs font-medium hover:bg-muted transition-colors"
                >
                  Segna
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Link href="/dashboard/smart?v=spese-fisse" className="min-h-11 inline-flex items-center self-start text-sm text-primary hover:underline">
        {rows.length > shown.length ? `Vedi tutte (${rows.length}) →` : "Vedi tutte →"}
      </Link>
    </section>
  );
}
