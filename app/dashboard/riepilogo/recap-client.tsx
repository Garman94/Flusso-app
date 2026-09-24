"use client";

import { useEffect, useState } from "react";
import { formatEuro } from "@/lib/calculations";
import { track } from "@/lib/track";

/** Chiave del banner in dashboard: il riepilogo di questo periodo è già stato visto o chiuso. */
export const RECAP_SEEN_KEY = "flusso_riepilogo_visto";

/** Segna il riepilogo come visto (il banner in dashboard sparisce) e lo conta nelle metriche. */
export function RecapSeen({ from, latest }: { from: string; latest: boolean }) {
  useEffect(() => {
    if (latest) {
      try { localStorage.setItem(RECAP_SEEN_KEY, from); } catch { /* solo comodità */ }
    }
    void track("recap_viewed", { latest });
  }, [from, latest]);
  return null;
}

type Row = { id?: string; date: string; amount: number; description: string; icon: string };

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

/** Tutti i movimenti del periodo, chiusi finché non si tocca. */
export function RecapTransactions({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState(false);
  const byDay = new Map<string, Row[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-xl border px-4 py-3 text-sm font-medium flex items-center justify-between hover:bg-muted/40 transition-colors"
      >
        <span>{open ? "Nascondi i movimenti" : `Vedi tutti i movimenti (${rows.length})`}</span>
        <span className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open && (
        <div className="rounded-xl border overflow-hidden">
          {[...byDay.entries()].map(([day, list]) => (
            <div key={day}>
              <p className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30 capitalize">{fmtDay(day)}</p>
              {list.map((t, i) => (
                <div key={t.id ?? `${day}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 border-t first:border-t-0 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{t.icon}</span>
                    <span className="truncate">{t.description}</span>
                  </span>
                  <span className={`tabular-nums font-medium shrink-0 ${t.amount >= 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                    {t.amount >= 0 ? "+" : ""}{formatEuro(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
