// Date helpers — sempre YYYY-MM-DD nel fuso locale, mai in UTC.
//
// `date.toISOString().split("T")[0]` converte in UTC: a est di Greenwich una data
// costruita a mezzanotte locale (es. new Date(2026, 8, 1)) diventa il giorno
// PRIMA (2026-08-31). Sul server Vercel (UTC) non si nota, nel browser italiano sì.

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD di una Date usando i componenti locali (anno/mese/giorno). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// L'app è pensata per l'Italia: "oggi" è sempre la data di Europe/Rome, così
// server (UTC) e browser concordano anche tra mezzanotte e le 2 di notte.
const ROME_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data di oggi (Europe/Rome) come YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return ROME_DAY.format(now);
}

/** Data ISO spostata di `n` giorni sul calendario (senza sorprese col cambio dell'ora). */
export function addDaysISO(iso: string, n: number): string {
  return toISODate(new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
}
