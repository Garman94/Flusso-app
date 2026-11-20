// Notifiche push (Web Push) sul sito e sull'app installata dal browser. Qui solo calcoli, senza
// database né rete: li usano il browser (Account → Avvisi), il server e i test.
//
// Cosa si vede: la notifica compare sulla schermata di blocco, quindi non contiene mai importi
// (come l'oggetto delle email). Il testo dice solo cosa guardare; i numeri sono nell'app.
import { periodEndLabel, shortDay } from "./spendable";
import { isStale } from "./weekly-email";

/** Valore di ?da= nei link delle notifiche: ActivityPing lo registra come push_clicked. */
export const PUSH_SOURCE = "push-lunedi";
/** Per quanto il servizio di notifiche tiene la notifica del lunedì se il telefono è spento (secondi). */
export const WEEKLY_PUSH_TTL = 12 * 60 * 60;
/** Al massimo tanti dispositivi per persona: oltre si tolgono i più vecchi. */
export const MAX_DEVICES = 10;

// I servizi di notifiche dei browser: Chrome, Edge su Android, Samsung (Google); Safari su iPhone
// e Mac (Apple); Firefox (Mozilla); Edge su Windows (Microsoft). Stessa regola nella migration 053.
const ENDPOINT_RE =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//;
const P256DH_RE = /^[A-Za-z0-9_-]{40,200}$/;
const AUTH_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function isPushEndpoint(url: string): boolean {
  return url.length <= 1000 && ENDPOINT_RE.test(url);
}

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

/** I dati che il browser dà per un dispositivo (PushSubscription.toJSON()): validi o null. */
export function parseSubscription(raw: unknown): PushSubscriptionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };
  const str = (v: unknown) => (typeof v === "string" ? v.replace(/=+$/, "") : "");
  const endpoint = typeof r.endpoint === "string" ? r.endpoint : "";
  const p256dh = str(r.keys?.p256dh);
  const auth = str(r.keys?.auth);
  if (!isPushEndpoint(endpoint) || !P256DH_RE.test(p256dh) || !AUTH_RE.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

export const DEVICES = ["iPhone", "iPad", "Android", "Mac", "Windows", "Linux", "Altro"] as const;
export type Device = (typeof DEVICES)[number];

export function isDevice(v: unknown): v is Device {
  return typeof v === "string" && (DEVICES as readonly string[]).includes(v);
}

/** Solo il tipo di dispositivo, per contare in Admin chi usa le notifiche. */
export function deviceLabel(ua: string, touchPoints = 0): Device {
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  // dall'iPadOS 13 l'iPad si presenta come un Mac: lo tradisce lo schermo touch
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux|CrOS/.test(ua)) return "Linux";
  return "Altro";
}

/**
 * Se su questo dispositivo le notifiche si possono accendere.
 * - "android-app": l'app Android di Flusso mostra il sito in una WebView, che non ha le notifiche
 * - "ios-browser": su iPhone e iPad arrivano solo all'app aggiunta alla schermata Home
 * - "ios-old": aggiunta alla Home, ma iOS più vecchio del 16.4
 */
export type PushSupport = "ok" | "android-app" | "ios-browser" | "ios-old" | "unsupported";

export function pushSupport(env: {
  ua: string; touchPoints: number; standalone: boolean; hasPush: boolean; nativeApp: boolean;
}): PushSupport {
  if (env.nativeApp || /; wv\)/.test(env.ua)) return "android-app";
  if (env.hasPush) return "ok";
  const device = deviceLabel(env.ua, env.touchPoints);
  if (device === "iPhone" || device === "iPad") return env.standalone ? "ios-old" : "ios-browser";
  return "unsupported";
}

/** La chiave pubblica VAPID (base64url) nel formato che vuole pushManager.subscribe. */
export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** true se il dispositivo è iscritto con questa chiave (se le chiavi cambiano va iscritto di nuovo). */
export function sameKey(current: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

/** Quello che arriva al dispositivo: il service worker (public/sw.js) lo mostra. */
export type PushPayload = { title: string; body: string; url: string; tag: string };

export type WeeklyPushInput = { today: string; payDay: number; periodTo: string; lastTxDate: string | null };

/**
 * La notifica del lunedì. Due versioni, mai importi:
 * - "ok": «Nuova settimana · Guarda quanto puoi spendere fino al prossimo stipendio (26 nov).»
 * - "stale": l'ultimo movimento caricato ha più di 7 giorni (come l'email): invita a caricare il file.
 * Budget superato o soldi che mancano non si dicono qui: si vedrebbero dalla schermata di blocco.
 */
export function weeklyPush(input: WeeklyPushInput): PushPayload & { variant: "ok" | "stale" } {
  const label = periodEndLabel(input.payDay, input.periodTo); // "Fino al prossimo stipendio (26 nov)"
  const until = label.charAt(0).toLowerCase() + label.slice(1);
  if (isStale(input.lastTxDate, input.today)) {
    return {
      variant: "stale",
      title: "Carica i movimenti",
      body: input.lastTxDate
        ? `L'ultimo è del ${shortDay(input.lastTxDate)}. Carica l'estratto conto e Flusso ti dice quanto puoi spendere ${until}.`
        : `Carica l'estratto conto e Flusso ti dice quanto puoi spendere ${until}.`,
      url: `/dashboard/transazioni?import=1&da=${PUSH_SOURCE}`,
      tag: "flusso-lunedi",
    };
  }
  return {
    variant: "ok",
    title: "Nuova settimana",
    body: `Guarda quanto puoi spendere ${until}.`,
    url: `/dashboard?da=${PUSH_SOURCE}`,
    tag: "flusso-lunedi",
  };
}

/** La prova da Account → Avvisi. */
export const TEST_PUSH: PushPayload = {
  title: "Flusso",
  body: "Prova riuscita: le notifiche di Flusso arrivano su questo dispositivo.",
  url: "/dashboard/account#avvisi",
  tag: "flusso-prova",
};
