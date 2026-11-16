// Chi torna: quanti iscritti riaprono Flusso dopo una settimana e quanti lo usano ogni settimana.
// Si basa sull'evento `app_open` (al massimo uno ogni 6 ore per browser). `last_sign_in_at` di
// Supabase non serve: non si aggiorna finché la sessione resta valida.
// Funzioni pure: chi va escluso (admin, demo) lo decide chi le chiama passando solo gli utenti da contare.

import { shortDay } from "./spendable";

/** Dopo quanti giorni dall'iscrizione una visita conta come "è tornato". */
export const RETURN_DAYS = 7;
/** Obiettivo della ricerca UX di novembre: almeno il 40% torna dopo una settimana. */
export const RETURN_TARGET = 0.4;
/** Settimane mostrate nella tabella degli attivi. */
export const WEEKS_SHOWN = 8;
/** Sotto questo numero di persone la percentuale cambia molto con una persona sola. */
export const FEW_PEOPLE = 20;

const DAY = 86_400_000;

export type RetentionUser = { id: string; name: string | null; createdAt: string };
export type Visit = { userId: string; at: string };

export type ReturnStatus =
  | "returned"        // ha aperto Flusso almeno 7 giorni dopo l'iscrizione
  | "not_returned"
  | "too_early"       // iscritto da meno di 7 giorni
  | "before_tracking"; // la sua settimana è iniziata prima che Flusso contasse le visite

export type UserReturn = {
  id: string;
  name: string | null;
  createdAt: string;
  lastVisit: string | null;
  status: ReturnStatus;
};

export type ReturnSummary = {
  eligible: number;       // iscritti che si possono contare
  returned: number;
  rate: number | null;    // null se nessuno si può contare
  tooEarly: number;
  beforeTracking: number;
};

export type WeekRow = { start: string; active: number; newUsers: number };

/**
 * Stato di ogni utente. `trackingSince` è la prima visita registrata in assoluto: chi aveva la
 * settimana dopo l'iscrizione già passata prima di quel giorno non si conta, perché un suo ritorno
 * di allora non risulterebbe e lo darebbe per perso.
 */
export function userReturns(
  users: RetentionUser[],
  visits: Visit[],
  now: Date,
  trackingSince: string | null,
): UserReturn[] {
  const byUser = new Map<string, number[]>();
  for (const v of visits) {
    const t = Date.parse(v.at);
    if (Number.isNaN(t)) continue;
    const list = byUser.get(v.userId);
    if (list) list.push(t);
    else byUser.set(v.userId, [t]);
  }
  const since = trackingSince ? Date.parse(trackingSince) : NaN;

  return users
    .map((u): UserReturn => {
      const created = Date.parse(u.createdAt);
      const times = byUser.get(u.id) ?? [];
      const last = times.length ? times.reduce((m, t) => (t > m ? t : m)) : null;
      const returnFrom = created + RETURN_DAYS * DAY;
      let status: ReturnStatus;
      if (Number.isNaN(since) || returnFrom < since) status = "before_tracking";
      else if (now.getTime() < returnFrom) status = "too_early";
      else status = times.some(t => t >= returnFrom) ? "returned" : "not_returned";
      return {
        id: u.id,
        name: u.name,
        createdAt: u.createdAt,
        lastVisit: last === null ? null : new Date(last).toISOString(),
        status,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function returnSummary(rows: UserReturn[]): ReturnSummary {
  const count = (s: ReturnStatus) => rows.filter(r => r.status === s).length;
  const returned = count("returned");
  const eligible = returned + count("not_returned");
  return {
    eligible,
    returned,
    rate: eligible > 0 ? returned / eligible : null,
    tooEarly: count("too_early"),
    beforeTracking: count("before_tracking"),
  };
}

const ROME_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Lunedì (YYYY-MM-DD) della settimana di un istante, col calendario di Roma. */
export function mondayOf(at: Date): string {
  const iso = ROME_DAY.format(at);
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function shiftWeeks(monday: string, n: number): string {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

/**
 * Persone diverse che hanno aperto Flusso in ogni settimana (lunedì-domenica) e nuovi iscritti,
 * dalla più vecchia alla settimana in corso (l'ultima, ancora a metà). Contano solo gli utenti passati.
 */
export function weeklyActive(users: RetentionUser[], visits: Visit[], now: Date, weeks: number = WEEKS_SHOWN): WeekRow[] {
  const known = new Set(users.map(u => u.id));
  const current = mondayOf(now);
  const starts = Array.from({ length: weeks }, (_, i) => shiftWeeks(current, i - weeks + 1));
  const active = new Map<string, Set<string>>(starts.map(s => [s, new Set()]));
  const added = new Map<string, number>(starts.map(s => [s, 0]));

  for (const v of visits) {
    if (!known.has(v.userId)) continue;
    const t = new Date(v.at);
    if (Number.isNaN(t.getTime())) continue;
    active.get(mondayOf(t))?.add(v.userId);
  }
  for (const u of users) {
    const t = new Date(u.createdAt);
    if (Number.isNaN(t.getTime())) continue;
    const week = mondayOf(t);
    if (added.has(week)) added.set(week, added.get(week)! + 1);
  }
  return starts.map(start => ({ start, active: active.get(start)!.size, newUsers: added.get(start)! }));
}

/**
 * Persone diverse che hanno aperto Flusso negli ultimi `days` giorni e nei `days` giorni prima:
 * il numero grande della card, più stabile della settimana in corso (che il lunedì è quasi vuota).
 */
export function activeInLastDays(
  users: RetentionUser[],
  visits: Visit[],
  now: Date,
  days: number = 7,
): { current: number; previous: number } {
  const known = new Set(users.map(u => u.id));
  const end = now.getTime();
  const mid = end - days * DAY;
  const start = mid - days * DAY;
  const current = new Set<string>();
  const previous = new Set<string>();
  for (const v of visits) {
    if (!known.has(v.userId)) continue;
    const t = Date.parse(v.at);
    if (t > mid && t <= end) current.add(v.userId);
    else if (t > start && t <= mid) previous.add(v.userId);
  }
  return { current: current.size, previous: previous.size };
}

/** "dal 16 nov" per la riga della tabella; "questa settimana" per quella in corso. */
export function weekLabel(start: string, now: Date): string {
  return start === mondayOf(now) ? "Questa settimana" : `Dal ${shortDay(start)}`;
}

/** Giorno di Roma di un istante, come "20 set". */
export function romeShortDay(at: string): string {
  return shortDay(ROME_DAY.format(new Date(at)));
}
