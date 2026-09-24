"use client";

import { useState, useTransition } from "react";
import { previewLoginUrl } from "@/app/actions/anteprima";
import type { PendingChange } from "@/lib/anteprima";

export function AdminAnteprima({ changes, hasBypass }: { changes: PendingChange[] | null; hasBypass: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nothingPending = changes !== null && changes.length === 0;

  function open() {
    setError(null);
    // La scheda si apre subito, dentro il clic: aperta dopo l'attesa il browser la bloccherebbe.
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const res = await previewLoginUrl();
      if (!res.url) {
        tab?.close();
        setError(res.error ?? "Errore.");
        return;
      }
      if (tab) tab.location.href = res.url;
      else window.location.href = res.url;
    });
  }

  return (
    <div className="rounded-xl border-2 border-violet-500/40 p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">🔍 Anteprima delle novità</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Apre la prossima versione, prima di pubblicarla, già con il tuo account. I dati sono quelli veri:
          quello che fai lì resta salvato.
        </p>
      </div>

      {changes === null ? (
        <p className="text-sm text-muted-foreground">Non riesco a leggere da GitHub cosa c&apos;è in attesa.</p>
      ) : nothingPending ? (
        <p className="text-sm text-muted-foreground">Nessuna novità in attesa: il sito è già aggiornato.</p>
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Da pubblicare:</span>
          {changes.map(c => (
            <a key={c.number} href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              • {c.title} <span className="text-muted-foreground">(#{c.number})</span>
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={open}
          disabled={isPending || nothingPending}
          className="self-start bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Apro…" : "Apri anteprima ↗"}
        </button>
        {!hasBypass && !nothingPending && (
          <p className="text-xs text-muted-foreground">
            La prima volta Vercel può chiederti di entrare con il tuo account Vercel.
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
