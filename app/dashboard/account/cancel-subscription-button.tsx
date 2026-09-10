"use client";

import { useState } from "react";
import { toast } from "sonner";

export function CancelSubscriptionButton({ onCancelled }: { onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    setLoading(true);
    try {
      const res = await fetch("/api/subscription/cancel", { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result?.error ?? "Errore durante l'annullamento.");
        return;
      }
      toast.success("Abbonamento annullato. Sei tornato al piano Gratuito.");
      onCancelled();
      setOpen(false);
    } catch {
      toast.error("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm border border-destructive text-destructive rounded-md px-4 py-2 hover:bg-destructive/10 transition-colors w-fit"
      >
        Annulla abbonamento
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-xl p-6 max-w-md w-full mx-4 flex flex-col gap-4 shadow-xl">
            <h3 className="font-semibold text-lg">Annullare l&apos;abbonamento?</h3>
            <p className="text-sm text-muted-foreground">
              Il tuo abbonamento Premium verrà annullato immediatamente e tornerai al piano Gratuito. Non ti verranno addebitati ulteriori pagamenti.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={loading}
                className="bg-destructive text-destructive-foreground rounded-md px-5 py-2 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Annullamento..." : "Sì, annulla abbonamento"}
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="border rounded-md px-5 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                Indietro
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
