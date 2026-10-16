"use client";

import { useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/track";
import { autoCategorize } from "./actions";

// "✨ Categorizza in automatico": ai movimenti ancora senza categoria applica le regole personali,
// poi il dizionario condiviso dei negozi e le parole del codice (lib/categorize.ts → categorize).
// Non tocca mai i movimenti che hanno già una categoria: le scelte fatte a mano restano.

type Category = { id: string; name: string };

export function AutoCategorizeBanner({ uncategorized, categories, onAssigned }: {
  uncategorized: number;
  categories: Category[];
  onAssigned: (assigned: { id: string; category_id: string }[]) => void;
}) {
  const [running, setRunning] = useState(false);
  if (uncategorized === 0) return null;

  async function run() {
    setRunning(true);
    const res = await autoCategorize();
    setRunning(false);
    if (res.error) {
      toast.error(res.error.includes("DEMO_READONLY") ? "Nella demo non si può salvare." : `Errore: ${res.error}`);
      return;
    }
    void track("auto_categorize_used", { assigned: res.assigned.length, remaining: res.remaining });
    if (res.assigned.length === 0) {
      toast("Non ho riconosciuto nessun negozio. Scegli tu la categoria: con \"Ricorda\" Flusso imparerà.");
      return;
    }
    onAssigned(res.assigned);
    const counts = new Map<string, number>();
    for (const a of res.assigned) counts.set(a.category_id, (counts.get(a.category_id) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, n]) => `${categories.find(c => c.id === id)?.name ?? "?"} ${n}`).join(", ");
    toast.success(`Ne ho sistemati ${res.assigned.length} (${top}).${res.remaining ? ` Restano ${res.remaining} da scegliere a mano.` : ""}`);
  }

  return (
    <div className="rounded-xl border px-4 py-3 flex items-center gap-3 text-sm">
      <span className="text-lg shrink-0">📂</span>
      <span className="flex-1 min-w-0">
        <strong>{uncategorized}</strong> {uncategorized === 1 ? "movimento senza categoria" : "movimenti senza categoria"}
        <span className="block text-xs text-muted-foreground">Flusso li riconosce dal nome del negozio. Quelli già categorizzati non li tocca.</span>
      </span>
      <button onClick={run} disabled={running}
        className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 shrink-0">
        {running ? "…" : "✨ Categorizza"}
      </button>
    </div>
  );
}
