// Perché una lettura di foto o PDF con l'AI non riesce: un codice breve per l'evento
// `screenshot_failed` (props.reason). Prima tutti gli errori del server finivano in "server"
// e dai dati non si capiva niente. Mai importi, descrizioni o testo della risposta nei codici.

/** Errori decisi dal server (screenshot-action.ts). */
export type ServerFailure =
  | "unauthenticated"
  | "not_premium"
  | "not_active"      // chiave dell'API mancante o con un formato strano
  | "too_big"
  | "daily_limit"
  | "api_auth"        // chiave rifiutata (401/403)
  | "api_credit"      // credito dell'account Anthropic finito
  | "api_rate"        // 429
  | "api_overloaded"  // 529 o 5xx
  | "api_bad_request" // 400: file che l'API non sa leggere (PDF protetto, immagine rovinata…)
  | "api_timeout"
  | "api_network"
  | "api_other"
  | "empty_reply"     // l'AI non ha scritto niente
  | "not_json"        // ha risposto a parole invece che con l'elenco
  | "truncated"       // risposta tagliata prima del primo movimento
  | "rows_unreadable" // righe senza data o importo validi
  | "no_rows";        // elenco vuoto: per l'AI non ci sono movimenti

/** Errori decisi dal browser (screenshot-modal.tsx). */
export type ClientFailure =
  | "wrong_type"
  | "too_big"
  | "decode"          // il browser non sa aprire l'immagine (es. HEIC fuori da Safari)
  | "bad_response"    // risposta non valida dal server: funzione scaduta o richiesta troppo grande
  | "network"
  | "server_crash"    // errore non gestito dentro la server action
  | "unknown"
  | "save";

type ApiErrorLike = { status?: number; name?: string; message?: string };

/** Errore lanciato dall'SDK di Anthropic → codice. */
export function apiFailure(err: unknown): ServerFailure {
  const e = (err ?? {}) as ApiErrorLike;
  const message = typeof e.message === "string" ? e.message : String(err ?? "");
  const name = typeof e.name === "string" ? e.name : "";
  const status = typeof e.status === "number" ? e.status : undefined;
  // Il credito finito arriva come 400 con un messaggio apposta: va riconosciuto prima del 400 generico
  if (/credit balance/i.test(message)) return "api_credit";
  if (/timeout|timed out/i.test(name) || /timed? ?out/i.test(message)) return "api_timeout";
  if (status === undefined && /connection/i.test(name + " " + message)) return "api_network";
  if (status === 401 || status === 403) return "api_auth";
  if (status === 429) return "api_rate";
  if (status === 529 || (status !== undefined && status >= 500)) return "api_overloaded";
  if (status === 400 || status === 413) return "api_bad_request";
  return "api_other";
}

/** Nessun movimento letto: perché. `stopReason` è quello della risposta dell'API. */
export function noRowsFailure(raw: string, dropped: number, stopReason?: string | null): ServerFailure {
  const text = raw.trim();
  if (!text) return "empty_reply";
  if (dropped > 0) return "rows_unreadable";
  if (stopReason === "max_tokens") return "truncated";
  if (!text.includes("[")) return "not_json";
  return "no_rows";
}

/** Eccezione presa dal browser mentre aspettava la server action → codice. */
export function exceptionFailure(err: unknown): ClientFailure {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/unexpected response/i.test(message)) return "bad_response";
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) return "network";
  if (/server components render|omitted in production|digest/i.test(message)) return "server_crash";
  return "unknown";
}

/** Dimensione del file a fasce: dice se il problema sono i file grandi, senza dire quale file. */
export function sizeBucket(bytes: number): string {
  const mb = bytes / 1_000_000;
  if (mb < 0.5) return "<0.5MB";
  if (mb < 1) return "0.5-1MB";
  if (mb < 2) return "1-2MB";
  if (mb < 3) return "2-3MB";
  return ">3MB";
}

/** Secondi passati, arrotondati: i fallimenti tutti a 10, 15, 60 o 300 secondi vogliono dire "tempo scaduto". */
export function elapsedSeconds(startMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.round((nowMs - startMs) / 1000));
}

/**
 * PDF protetto (ha un dizionario /Encrypt). Non lo blocchiamo prima di inviarlo: molti estratti
 * conto hanno solo i permessi bloccati e si aprono senza password, e l'AI potrebbe leggerli.
 * Serve per spiegare meglio l'errore se la lettura non riesce, e per contarli.
 */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  // latin1 conserva un byte per carattere: basta cercare la parola chiave nel testo grezzo
  const text = new TextDecoder("latin1").decode(bytes);
  return /\/Encrypt\b/.test(text);
}

/** Immagine HEIC/HEIF (foto dell'iPhone): fuori da Safari il browser di solito non la apre. */
export function isHeic(file: { type: string; name: string }): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}
