"use client";

import { useState, useTransition } from "react";
import { emailTest } from "./email-test-actions";
import type { EmailKind } from "@/lib/email-token";

const TEXT: Record<EmailKind, { title: string; description: string }> = {
  weekly: {
    title: "✉️ Email del lunedì",
    description: "Parte da sola il lunedì mattina verso le 7, solo dal sito pubblicato. Tu e la demo non la ricevete: da qui la vedi con i tuoi numeri.",
  },
  monthly: {
    title: "📅 Email del mese",
    description: "Parte da sola verso le 18 (le 19 d'estate), nei primi 10 giorni dopo lo stipendio, una volta per mese e solo se i movimenti arrivano fino alla fine. Tu e la demo non la ricevete: da qui vedi il tuo ultimo mese chiuso.",
  },
};

/** Admin: vedere o ricevere subito un'email automatica con i propri numeri. */
export function AdminEmailTest({ kind }: { kind: EmailKind }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function preview() {
    setMsg(null);
    const tab = window.open("about:blank", "_blank"); // dentro il clic, o il browser la blocca
    startTransition(async () => {
      const res = await emailTest(kind, "preview");
      if (!res.html) {
        tab?.close();
        setMsg(res.error ?? "Errore.");
        return;
      }
      const url = URL.createObjectURL(new Blob([res.html], { type: "text/html" }));
      if (tab) tab.location.href = url;
      setMsg(`Versione: ${res.variant}.${res.note ? ` ${res.note}` : ""}`);
    });
  }

  function send() {
    setMsg(null);
    startTransition(async () => {
      const res = await emailTest(kind, "send");
      setMsg(res.sentTo ? `Mandata a ${res.sentTo} (versione: ${res.variant}).${res.note ? ` ${res.note}` : ""}` : (res.error ?? "Errore."));
    });
  }

  return (
    <div className="rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{TEXT[kind].title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{TEXT[kind].description}</p>
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
