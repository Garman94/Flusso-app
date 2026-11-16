"use client";

import { useState, useTransition } from "react";
import { weeklyEmailTest } from "./email-test-actions";

/** Admin: vedere o ricevere subito l'email del lunedì con i propri numeri. */
export function AdminEmailLunedi() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function preview() {
    setMsg(null);
    const tab = window.open("about:blank", "_blank"); // dentro il clic, o il browser la blocca
    startTransition(async () => {
      const res = await weeklyEmailTest("preview");
      if (!res.html) {
        tab?.close();
        setMsg(res.error ?? "Errore.");
        return;
      }
      const url = URL.createObjectURL(new Blob([res.html], { type: "text/html" }));
      if (tab) tab.location.href = url;
      setMsg(`Versione: ${res.variant}.`);
    });
  }

  function send() {
    setMsg(null);
    startTransition(async () => {
      const res = await weeklyEmailTest("send");
      setMsg(res.sentTo ? `Mandata a ${res.sentTo} (versione: ${res.variant}).` : (res.error ?? "Errore."));
    });
  }

  return (
    <div className="rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">✉️ Email del lunedì</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Parte da sola il lunedì mattina verso le 7, solo dal sito pubblicato. Tu e la demo non la ricevete:
          da qui la vedi con i tuoi numeri.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={preview} disabled={pending} className="min-h-11 border rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors">
          Vedila ↗
        </button>
        <button onClick={send} disabled={pending} className="min-h-11 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {pending ? "Un attimo…" : "Mandamela ora"}
        </button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
