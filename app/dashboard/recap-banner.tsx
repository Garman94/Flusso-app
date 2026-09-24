"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEuro } from "@/lib/calculations";
import { track, trackThrottled } from "@/lib/track";
import { RECAP_SEEN_KEY } from "./riepilogo/recap-client";

/** Periodo appena chiuso, calcolato dal server (app/dashboard/page.tsx). */
export type RecapTeaser = {
  from: string;
  month: string;
  saved: number;
  /** false: gli ultimi giorni non sono ancora stati caricati */
  complete: boolean;
};

/**
 * Nei primi giorni di un periodo nuovo invita a guardare il riepilogo di quello appena
 * chiuso: è il momento in cui il mese è finito e si pianifica il prossimo. Sparisce dopo
 * averlo aperto o chiuso con ✕ (nel browser, per periodo).
 */
export function RecapBanner({ teaser }: { teaser: RecapTeaser }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen: string | null = null;
    try { seen = localStorage.getItem(RECAP_SEEN_KEY); } catch { /* niente */ }
    if (seen === teaser.from) return;
    setShow(true);
    trackThrottled("recap_banner_shown", { complete: teaser.complete }, 30 * 86_400_000, `recap_banner:${teaser.from}:${teaser.complete}`);
  }, [teaser.from, teaser.complete]);

  if (!show) return null;

  function close() {
    try { localStorage.setItem(RECAP_SEEN_KEY, teaser.from); } catch { /* niente */ }
    setShow(false);
    void track("recap_banner_closed", { complete: teaser.complete });
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
      <span className="text-2xl shrink-0">📊</span>
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-medium">Com&apos;è andato {teaser.month}?</p>
        <p className="text-muted-foreground">
          {!teaser.complete
            ? <>Mancano gli ultimi giorni: carica l&apos;estratto conto per il riepilogo completo.</>
            : teaser.saved >= 0
              ? <>Hai risparmiato <strong className="text-foreground">{formatEuro(teaser.saved)}</strong>. Guarda il riepilogo.</>
              : <>Le uscite hanno superato le entrate di <strong className="text-foreground">{formatEuro(-teaser.saved)}</strong>. Guarda dove sono andati i soldi.</>}
        </p>
      </div>
      <Link
        href={teaser.complete ? `/dashboard/riepilogo?da=${teaser.from}` : "/dashboard/transazioni"}
        onClick={() => void track("recap_banner_clicked", { complete: teaser.complete })}
        className="text-sm bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors shrink-0"
      >
        {teaser.complete ? "Vedi" : "Carica"}
      </Link>
      <button onClick={close} aria-label="Chiudi" className="text-muted-foreground hover:text-foreground px-1 shrink-0">✕</button>
    </div>
  );
}
