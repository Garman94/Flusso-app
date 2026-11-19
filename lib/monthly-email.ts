// Email del mese: "com'è andato ottobre", dopo che si è chiuso il periodo di paga. Funzione pura:
// i numeri arrivano da lib/recap.ts (gli stessi della pagina Mesi passati), qui si decide solo
// quando mandarla e cosa dire.
//
// Regole:
// - Parte nei primi RECAP_BANNER_DAYS giorni del periodo nuovo, come il banner in dashboard, e una
//   volta sola per periodo (email_sends, period_key = inizio del periodo chiuso).
// - Solo se il periodo chiuso è completo (movimenti fino agli ultimi RECAP_COMPLETE_DAYS giorni, non
//   cominciati a metà, almeno MONTHLY_MIN_TXS): con l'estratto conto a metà il risparmio sarebbe
//   falso. A ricordare di caricare il file ci pensa già l'email del lunedì.
// - Niente importi nell'oggetto né nella riga di anteprima: si vedono sulla schermata di blocco.
// - Il testo dell'utente (nome, categorie) passa sempre da escapeHtml.

import { formatEuro } from "./calculations";
import { addDaysISO } from "./dates";
import { currentPeriod } from "./period";
import { emailButton, emailLayout, escapeHtml } from "./email-layout";
import { shortDay } from "./spendable";
import { periodContaining, periodName, RECAP_BANNER_DAYS, type Period, type Recap } from "./recap";

/** Valore di `da` nei link: dice da dove arriva il clic (evento email_clicked). */
export const MONTHLY_SOURCE = "email-mese";
/** Sotto questi movimenti nel periodo chiuso il riepilogo non dice niente (come il banner). */
export const MONTHLY_MIN_TXS = 3;
/**
 * Il primo giorno in cui il giro manda l'email. La privacy promette 15 giorni di preavviso per le
 * modifiche sostanziali: Marco ha scelto (19/11) di aggiungere il riepilogo del mese alla privacy e
 * farlo partire almeno 15 giorni dopo la pubblicazione, senza un'altra email di avviso.
 * Da spostare se la pubblicazione arriva dopo il 22/11. «Mandamela ora» in Admin funziona lo stesso.
 */
export const MONTHLY_FIRST_DAY = "2026-12-07";

export function monthlyStarted(day: string): boolean {
  return day >= MONTHLY_FIRST_DAY;
}

const MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** "7 dicembre", per Account → Avvisi ("Parte dal 7 dicembre"). */
export function monthlyStartLabel(): string {
  return `${Number(MONTHLY_FIRST_DAY.slice(8, 10))} ${MONTH_NAMES[Number(MONTHLY_FIRST_DAY.slice(5, 7)) - 1]}`;
}

type ClosedPeriod = Period & { year: number; month: number };

/** L'ultimo periodo chiuso, visto da `today` (YYYY-MM-DD, Europe/Rome). */
export function lastClosedPeriod(payDay: number, today: string): ClosedPeriod {
  const cur = currentPeriod(payDay, new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10), 12));
  return periodContaining(payDay, addDaysISO(cur.from, -1));
}

/** Il periodo da riepilogare se oggi è nei primi RECAP_BANNER_DAYS giorni del nuovo, altrimenti null. */
export function periodToRecap(payDay: number, today: string): ClosedPeriod | null {
  const closed = lastClosedPeriod(payDay, today);
  return today < addDaysISO(closed.to, 1 + RECAP_BANNER_DAYS) ? closed : null;
}

export type RecapReadiness = "ok" | "few" | "incomplete" | "starts-late";

/** Se il riepilogo è affidabile abbastanza da mandarlo per email. */
export function recapReadiness(r: Pick<Recap, "txCount" | "maybeIncomplete" | "startsLate">): RecapReadiness {
  if (r.txCount < MONTHLY_MIN_TXS) return "few";
  if (r.maybeIncomplete) return "incomplete";
  if (r.startsLate) return "starts-late";
  return "ok";
}

export type MonthlyEmailInput = {
  name: string | null;
  payDay: number;
  recap: Recap;
};

export type MonthlyEmailLinks = {
  recap: string;
  plan: string;
  settings: string;
  unsubscribe: string;
};

export type MonthlyEmail = {
  /** saved | overspent: per i conteggi, mai importi */
  variant: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

function firstName(name: string | null): string | null {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n ? n : null;
}

const P = "margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;";
const SMALL = "margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.6;";
const GREEN = "#15803d";
const RED = "#dc2626";

/** "80,00 € più del mese prima", "come il mese prima". */
function vsPrevious(diff: number): string {
  if (Math.abs(diff) < 1) return "come il mese prima";
  return `${formatEuro(Math.abs(diff))} ${diff > 0 ? "più" : "meno"} del mese prima`;
}

/** Le righe di "Da ricordare", in testo semplice (l'HTML le ripulisce). */
export function monthlyHighlights(r: Recap): string[] {
  const out: string[] = [];
  for (const c of r.changes.slice(0, 3)) {
    if (c.isNew) out.push(`${c.icon} ${c.name}: ${formatEuro(c.total)}, di solito niente`);
    else out.push(`${c.icon} ${c.name}: ${formatEuro(Math.abs(c.diff))} ${c.diff > 0 ? "più" : "meno"} del solito (${formatEuro(c.total)})`);
  }
  if (r.fixed && r.fixed.count > 0) {
    out.push(`🧾 Spese fisse: ${r.fixed.paidCount} su ${r.fixed.count} trovate nei movimenti`);
  }
  if (r.budget && r.budget.count > 0) {
    const { count, within, over } = r.budget;
    if (within === count) {
      out.push(count === 1 ? "🎯 Budget rispettato" : `🎯 Budget rispettati: tutti e ${count}`);
    } else {
      const which = over.slice(0, 2).map(o => `${o.name} di ${formatEuro(o.by)}`).join(", ");
      out.push(`🎯 Budget rispettati: ${within} su ${count}. Superato: ${which}${over.length > 2 ? "…" : ""}`);
    }
  }
  return out;
}

export function monthlyEmail(input: MonthlyEmailInput, links: MonthlyEmailLinks): MonthlyEmail {
  const { payDay, recap: r } = input;
  const who = firstName(input.name);
  const hello = who ? `Ciao ${who},` : "Ciao,";
  const name = periodName(payDay, r.period);
  const month = name.month;
  const Month = month.charAt(0).toUpperCase() + month.slice(1);
  const label = payDay > 0 ? `${Month} ${name.year} · ${shortDay(r.period.from)} – ${shortDay(r.period.to)}` : `${Month} ${name.year}`;

  const saved = r.saved >= 0;
  const variant = saved ? "saved" : "overspent";
  const headline = saved ? "Hai risparmiato" : "Hai speso più di quanto è entrato";
  const amount = `${saved ? "" : "−"}${formatEuro(Math.abs(r.saved))}`;
  const notes: string[] = [];
  if (saved && r.savedRate !== null && r.saved > 0) notes.push(`il ${Math.round(r.savedRate * 100)}% di quello che è entrato`);
  if (r.prev) notes.push(vsPrevious(r.saved - r.prev.saved));
  const note = notes.length ? notes.join(", ") + "." : "";
  const highlights = monthlyHighlights(r);

  const subject = `Com'è andato ${month}`;
  const preheader = "Il tuo mese in un'occhiata: risparmio, spese e budget.";

  const content = `<p style="${P}">${escapeHtml(hello)}</p>
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.03em;">${escapeHtml(label)}</p>
    <p style="margin:0 0 4px;font-size:15px;color:#374151;">${headline}</p>
    <p style="margin:0 0 8px;font-size:36px;font-weight:700;color:${saved ? GREEN : RED};line-height:1.2;">${amount}</p>
    ${note ? `<p style="${P}">${escapeHtml(note.charAt(0).toUpperCase() + note.slice(1))}</p>` : ""}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;color:#374151;">
      <tr>
        <td style="padding:8px 0;border-top:1px solid #f3f4f6;">Entrate<br /><strong style="font-size:16px;color:#111827;">${formatEuro(r.income)}</strong></td>
        <td style="padding:8px 0;border-top:1px solid #f3f4f6;">Uscite<br /><strong style="font-size:16px;color:#111827;">${formatEuro(r.expenses)}</strong></td>
      </tr>
    </table>
    ${highlights.length ? `<p style="margin:24px 0 8px;font-size:15px;font-weight:600;color:#111827;">Da ricordare</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#374151;line-height:1.6;">
      ${highlights.map(h => `<li style="margin:0 0 4px;">${escapeHtml(h)}</li>`).join("")}
    </ul>` : ""}
    <div style="margin:24px 0 16px;">${emailButton(links.recap, "Vedi il riepilogo completo →")}</div>
    <p style="${SMALL}">Il mese nuovo è iniziato: <a href="${escapeHtml(links.plan)}" style="color:#6b7280;">dai un'occhiata a spese fisse e budget</a>, così la previsione di fine mese è giusta.</p>`;

  const footerExtra = `Ti scriviamo una volta al mese, quando si chiude il periodo, perché hai un account Flusso.
    <a href="${escapeHtml(links.unsubscribe)}" style="color:#6b7280;">Non voglio più questa email</a> ·
    <a href="${escapeHtml(links.settings)}" style="color:#6b7280;">Avvisi in Account</a>`;

  const text = [
    hello,
    "",
    `${label}`,
    `${headline}: ${amount}${note ? `, ${note}` : "."}`,
    `Entrate ${formatEuro(r.income)} · Uscite ${formatEuro(r.expenses)}`,
    ...(highlights.length ? ["", "Da ricordare:", ...highlights.map(h => `- ${h}`)] : []),
    "",
    `Vedi il riepilogo completo: ${links.recap}`,
    `Spese fisse e budget per il mese nuovo: ${links.plan}`,
    "",
    "—",
    "Ti scriviamo una volta al mese, quando si chiude il periodo, perché hai un account Flusso.",
    `Non voglio più questa email: ${links.unsubscribe}`,
    `Avvisi in Account: ${links.settings}`,
  ].join("\n");

  return { variant, subject, preheader, html: emailLayout(content, { preheader, footerExtra }), text };
}
