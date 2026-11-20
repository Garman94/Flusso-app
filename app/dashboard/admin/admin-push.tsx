"use client";

import { useState, useTransition } from "react";
import type { PushStats } from "@/lib/push-server";
import { adminWeeklyPush } from "./push-test-actions";

/** Admin: chi ha le notifiche accese e la prova della notifica del lunedì. */
export function AdminPush({ stats, configured }: { stats: PushStats | null; configured: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const devices = stats
    ? Object.entries(stats.byDevice).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${n} ${d}`).join(", ")
    : "";

  return (
    <div className="rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">📲 Notifiche</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Le accende ognuno da Account → Avvisi, telefono per telefono. Il lunedì verso le 7 parte «Nuova settimana: guarda
          quanto puoi spendere…», senza importi, solo dal sito pubblicato. Tu la ricevi come gli altri, se le hai accese.
        </p>
      </div>
      {!configured ? (
        <p className="text-sm">Mancano le chiavi VAPID su Vercel{stats ? "" : " e la tabella (migration 053)"}: per ora nessuno le può accendere.</p>
      ) : !stats ? (
        <p className="text-sm">Manca la tabella (migration 053): per ora nessuno le può accendere.</p>
      ) : (
        <p className="text-sm">
          {stats.people === 0
            ? "Nessuno le ha ancora accese."
            : `${stats.people} ${stats.people === 1 ? "persona" : "persone"} su ${stats.devices} ${stats.devices === 1 ? "dispositivo" : "dispositivi"} (${devices}).`}
        </p>
      )}
      <div>
        <button
          onClick={() => { setMsg(null); startTransition(async () => setMsg((await adminWeeklyPush()).message)); }}
          disabled={pending || !configured || !stats}
          className="min-h-11 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {pending ? "Un attimo…" : "Mandami quella del lunedì"}
        </button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
