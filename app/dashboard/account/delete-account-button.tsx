"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteAccount } from "./actions";

export function DeleteAccountButton({ hasPlan }: { hasPlan: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const result = await deleteAccount();
    if (result?.error) {
      toast.error(result.error);
      setLoading(false);
    }
    // on success the server action redirects to /auth/login
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm border border-destructive text-destructive rounded-md px-4 py-2 hover:bg-destructive/10 transition-colors w-fit"
      >
        Elimina account
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-xl p-6 max-w-md w-full mx-4 flex flex-col gap-4 shadow-xl">
            <h3 className="font-semibold text-lg">Sei sicuro?</h3>
            <p className="text-sm text-muted-foreground">
              Questa azione è <strong>irreversibile</strong>. Verranno eliminati il tuo account e tutti i dati associati (transazioni, obiettivi, categorie).
            </p>

            {hasPlan && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                Hai un abbonamento attivo. Prima di eliminare l&apos;account ricordati di disattivarlo per evitare ulteriori addebiti.
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Scrivi <span className="font-mono font-bold">elimina</span> per confermare
              </label>
              <input
                type="text"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="elimina"
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={confirm !== "elimina" || loading}
                className="bg-destructive text-destructive-foreground rounded-md px-5 py-2 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Eliminazione..." : "Elimina definitivamente"}
              </button>
              <button
                onClick={() => { setOpen(false); setConfirm(""); }}
                disabled={loading}
                className="border rounded-md px-5 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
