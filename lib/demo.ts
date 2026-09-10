// ============================================================
// Modalita' demo — account condiviso in sola lettura.
// ============================================================

/** Email dell'account demo. Override via env per staging. */
export const DEMO_EMAIL = (
  process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "demo@flussoapp.it"
).toLowerCase();

/** Password dell'account demo (account pubblico usa e getta). */
export const DEMO_PASSWORD =
  process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "Flusso2026!";

export function isDemoEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase() === DEMO_EMAIL;
}

/** Messaggio mostrato quando in demo si tenta di salvare. */
export const DEMO_BLOCKED_MESSAGE =
  "Registrati per salvare i tuoi dati";
