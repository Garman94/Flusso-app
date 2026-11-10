"use client";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** testo del pulsante rosso (default "Elimina") */
  confirmLabel?: string;
};

function ConfirmDialog({ title, message, confirmLabel = "Elimina", onClose }: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Il fuoco parte da "Annulla": un Invio di troppo non elimina niente.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => onClose(false)}>
      <div
        role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title"
        className="bg-background border rounded-xl p-6 max-w-sm w-full flex flex-col gap-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="font-semibold text-lg break-words">{title}</h3>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <div className="flex gap-3">
          <button ref={cancelRef} onClick={() => onClose(false)} className="flex-1 border rounded-md px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
            Annulla
          </button>
          <button onClick={() => onClose(true)} className="flex-1 bg-destructive text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-destructive/90 transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Chiede conferma prima di un'eliminazione: true se l'utente conferma.
 * Si usa da qualsiasi gestore di click, senza aggiungere stato al componente:
 * `if (!(await askConfirm({ title: "Eliminare…?" }))) return;`
 */
export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise(resolve => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    let done = false;
    const close = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
      // Smontare la finestra fuori dal click che la chiude.
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
    };
    root.render(<ConfirmDialog {...opts} onClose={close} />);
  });
}
