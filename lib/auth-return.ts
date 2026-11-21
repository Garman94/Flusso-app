// Ritorno dall'accesso con Google.
//
// Nell'app Android (Capacitor) l'accesso non può restare nella finestra dell'app (Google la rifiuta), e se
// esce verso Chrome il ritorno arriva in Chrome, dove manca il codice di verifica salvato dall'app (PKCE):
// «invalid request: both auth code and code verifier should be non-empty». Allora l'app apre Google in una
// scheda di Chrome sopra di sé (@capacitor/browser) e Supabase torna con APP_AUTH_REDIRECT: Android riapre
// l'app e MainActivity carica /auth/callback nella sua finestra, dove il codice di verifica c'è.
//
// Lo stesso indirizzo va tenuto uguale in tre posti: qui, in android/app/src/main/AndroidManifest.xml
// (intent-filter) e negli indirizzi di ritorno consentiti di Supabase (Authentication → URL Configuration).
export const APP_AUTH_REDIRECT = "it.flussoapp://auth/callback";

/**
 * Dove andare dopo l'accesso: solo una pagina di Flusso, mai un altro sito (il parametro `next` arriva
 * dall'indirizzo, quindi chiunque può scriverci). Si confronta l'origine dopo aver letto l'indirizzo come fa
 * il browser, così non passano trucchi come "//sito.it", "/\sito.it" o una tabulazione in mezzo.
 */
export function safeNext(next: string | null, base: string, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/")) return fallback;
  try {
    const url = new URL(next, base);
    if (url.origin !== new URL(base).origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
