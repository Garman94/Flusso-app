"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmUnsubscribe } from "./actions";

export function UnsubscribeButton({ u, k, t }: { u: string; k: string; t: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, startTransition] = useTransition();

  if (state === "done") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Fatto: non te la mandiamo più.</p>
        <Link href="/dashboard" className="min-h-11 inline-flex items-center self-start text-sm text-primary hover:underline">
          Apri Flusso →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => startTransition(async () => setState((await confirmUnsubscribe(u, k, t)).ok ? "done" : "error"))}
        disabled={pending}
        className="min-h-11 self-start bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {pending ? "Un attimo…" : "Sì, non mandarmela più"}
      </button>
      {state === "error" && (
        <p className="text-sm text-destructive">Non ci sono riuscito. Riprova, oppure spegnila da Account → Avvisi.</p>
      )}
    </div>
  );
}
