// Anteprima della prossima versione: il deploy di Vercel del branch `anteprima`, che contiene
// main più le modifiche non ancora pubblicate (le PR aperte). Dall'admin il tasto "Apri
// anteprima" ci entra già con l'account dell'admin (app/actions/anteprima.ts). Il branch va
// aggiornato a ogni PR: vedi CLAUDE.md → "Anteprima delle novità".

/** Indirizzo fisso: Vercel dà a ogni branch lo stesso indirizzo a ogni deploy. */
export const PREVIEW_URL = process.env.PREVIEW_URL ?? "https://flusso-app-git-anteprima-garman94s-projects.vercel.app";
export const PRODUCTION_URL = "https://www.flussoapp.it";

const REPO = "Garman94/Flusso-app";

/** Questo deploy è un'anteprima (non il sito pubblicato). */
export function isPreviewDeployment(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export type PendingChange = { number: number; title: string; url: string };

/**
 * Le modifiche in attesa di pubblicazione (PR aperte), dal repository pubblico su GitHub:
 * nessuna chiave. null se GitHub non risponde.
 */
export async function pendingChanges(): Promise<PendingChange[] | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=20`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const prs = (await res.json()) as { number: number; title: string; html_url: string }[];
    return prs.map(p => ({ number: p.number, title: p.title, url: p.html_url }));
  } catch {
    return null;
  }
}
