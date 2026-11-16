// Email del lunedì: "quanto puoi spendere fino al prossimo stipendio" e cosa c'è da pagare
// questa settimana. Funzione pura: i numeri arrivano da lib/hero-numbers.ts (gli stessi della
// dashboard), qui si decide solo cosa dire.
//
// Regole:
// - Se l'ultimo movimento caricato è più vecchio di STALE_DAYS giorni il "puoi spendere" sarebbe
//   troppo alto (mancano le spese recenti): l'email invita a caricare l'estratto conto e non lo dice.
// - Niente importi nell'oggetto né nella riga di anteprima: si vedono sulla schermata di blocco.
// - Il testo dell'utente (nome, nomi delle spese) passa sempre da escapeHtml.

import { formatEuro } from "./calculations";
import { emailButton, emailLayout, escapeHtml } from "./email-layout";
import { daysBetweenISO, periodEndLabel, shortDay, type Spendable } from "./spendable";
import { inDaysLabel, type UpcomingRow } from "./upcoming";

/** Oltre questi giorni dall'ultimo movimento caricato i numeri non sono affidabili. */
export const STALE_DAYS = 7;
/** Spese in arrivo mostrate al massimo. */
export const WEEK_UPCOMING_MAX = 5;
/** Valore di `da` nei link: dice da dove arriva il clic (evento email_clicked). */
export const WEEKLY_SOURCE = "email-lunedi";

export type WeeklyEmailInput = {
  name: string | null;
  today: string;
  payDay: number;
  periodTo: string;
  lastTxDate: string | null;
  /** null se il saldo non è mai stato inserito */
  spend: Spendable | null;
  /** spese fisse e rate ancora da pagare nel periodo */
  committed: number;
  upcoming: UpcomingRow[];
};

export type WeeklyEmailLinks = {
  dashboard: string;
  importFile: string;
  budget: string;
  settings: string;
  unsubscribe: string;
};

export type WeeklyEmail = {
  /** stale | no-balance | ok | over | short | no-budget: per l'evento, mai importi */
  variant: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

/** Spese da pagare nei prossimi 7 giorni (oggi compreso), non ancora pagate. */
export function upcomingThisWeek(rows: UpcomingRow[]): UpcomingRow[] {
  return rows
    .filter(r => (r.state === "upcoming" || r.state === "unverifiable") && r.daysTo != null && r.daysTo >= 0 && r.daysTo <= 6)
    .sort((a, b) => (a.daysTo ?? 0) - (b.daysTo ?? 0) || a.name.localeCompare(b.name, "it"))
    .slice(0, WEEK_UPCOMING_MAX);
}

export function isStale(lastTxDate: string | null, today: string): boolean {
  return !lastTxDate || daysBetweenISO(lastTxDate, today) > STALE_DAYS;
}

function firstName(name: string | null): string | null {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n ? n : null;
}

const P = "margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;";
const SMALL = "margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.6;";

export function weeklyEmail(input: WeeklyEmailInput, links: WeeklyEmailLinks): WeeklyEmail {
  const { today, payDay, periodTo, lastTxDate, spend, committed } = input;
  const who = firstName(input.name);
  const hello = who ? `Ciao ${who},` : "Ciao,";
  const until = periodEndLabel(payDay, periodTo); // "Fino al prossimo stipendio (26 nov)"
  const week = upcomingThisWeek(input.upcoming);

  // Blocco principale: [variante, html, testo, pulsante]
  let variant: string;
  let subject: string;
  let main: string;
  let mainText: string;
  let button: { href: string; label: string };

  if (isStale(lastTxDate, today)) {
    variant = "stale";
    subject = "Carica i movimenti: Flusso ti dice quanto puoi spendere";
    const last = lastTxDate
      ? `L'ultimo movimento che hai caricato è del ${shortDay(lastTxDate)}.`
      : "Non hai ancora caricato movimenti.";
    main = `<p style="${P}">${escapeHtml(last)} Carica l'estratto conto della banca: in un minuto Flusso ti dice quanto puoi spendere ${escapeHtml(until.charAt(0).toLowerCase() + until.slice(1))}.</p>`;
    mainText = `${last} Carica l'estratto conto della banca: in un minuto Flusso ti dice quanto puoi spendere ${until.charAt(0).toLowerCase() + until.slice(1)}.`;
    button = { href: links.importFile, label: "Carica l'estratto conto →" };
  } else if (!spend) {
    variant = "no-balance";
    subject = "Quanto puoi spendere questa settimana?";
    main = `<p style="${P}">Scrivi nella dashboard quanto hai oggi sul conto: da lì Flusso ti dice ogni lunedì quanto puoi spendere fino al prossimo stipendio.</p>`;
    mainText = "Scrivi nella dashboard quanto hai oggi sul conto: da lì Flusso ti dice ogni lunedì quanto puoi spendere fino al prossimo stipendio.";
    button = { href: links.dashboard, label: "Apri Flusso →" };
  } else if (spend.kind === "ok") {
    variant = "ok";
    subject = `Quanto puoi spendere fino al ${shortDay(periodTo)}`;
    const perDay = spend.days > 1
      ? `circa <strong>${formatEuro(spend.perDay)}</strong> al giorno per ${spend.days} giorni`
      : "oggi è l'ultimo giorno del periodo";
    const perDayText = spend.days > 1 ? `circa ${formatEuro(spend.perDay)} al giorno per ${spend.days} giorni` : "oggi è l'ultimo giorno del periodo";
    main = `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.03em;">${escapeHtml(until)}</p>
    <p style="margin:0 0 4px;font-size:15px;color:#374151;">Puoi spendere ancora</p>
    <p style="margin:0 0 8px;font-size:36px;font-weight:700;color:#111827;line-height:1.2;">${formatEuro(spend.amount)}</p>
    <p style="${P}">${perDay}.</p>
    ${spend.capped ? `<p style="${SMALL}">È quello che resta sul conto: il budget ti lascerebbe di più, ma contando le entrate in arrivo${committed > 0 ? " e le spese fisse ancora da pagare" : ""} non ci sono altri soldi.</p>` : ""}`;
    mainText = `${until}: puoi spendere ancora ${formatEuro(spend.amount)}, ${perDayText}.`;
    button = { href: links.dashboard, label: "Apri Flusso →" };
  } else if (spend.kind === "over") {
    variant = "over";
    subject = "Questa settimana conviene stringere";
    const rest = spend.days > 1 ? `Per i prossimi ${spend.days} giorni conviene stringere.` : "Oggi è l'ultimo giorno del periodo: domani si riparte.";
    const fixed = committed > 0 ? ` Restano da pagare spese fisse e rate per ${formatEuro(committed)}.` : "";
    main = `<p style="${P}"><strong>Hai superato il budget di ${formatEuro(spend.amount)}.</strong> ${escapeHtml(rest)}${fixed}</p>`;
    mainText = `Hai superato il budget di ${formatEuro(spend.amount)}. ${rest}${fixed}`;
    button = { href: links.dashboard, label: "Apri Flusso →" };
  } else if (spend.kind === "short") {
    variant = "short";
    subject = "Fino allo stipendio i conti sono stretti";
    main = `<p style="${P}"><strong>Mancano ${formatEuro(spend.amount)}</strong> per le spese fisse e le rate ancora da pagare, contando le entrate in arrivo. Per le altre spese non resta niente: se puoi, rimanda quelle che possono aspettare.</p>`;
    mainText = `Mancano ${formatEuro(spend.amount)} per le spese fisse e le rate ancora da pagare, contando le entrate in arrivo. Per le altre spese non resta niente: se puoi, rimanda quelle che possono aspettare.`;
    button = { href: links.dashboard, label: "Apri Flusso →" };
  } else {
    variant = "no-budget";
    subject = "Quanto puoi spendere questa settimana?";
    main = `<p style="${P}">Per sapere quanto puoi spendere fino al prossimo stipendio, Flusso ha bisogno di un budget per le spese di tutti i giorni (spesa, ristoranti, benzina…). Bastano due minuti in Pianifica → Budget.</p>`;
    mainText = "Per sapere quanto puoi spendere fino al prossimo stipendio, Flusso ha bisogno di un budget per le spese di tutti i giorni (spesa, ristoranti, benzina…). Bastano due minuti in Pianifica → Budget.";
    button = { href: links.budget, label: "Imposta il budget →" };
  }

  // In arrivo questa settimana
  let weekHtml = "";
  let weekText = "";
  if (week.length) {
    const rows = week.map(r => {
      const when = [inDaysLabel(r.daysTo), r.date ? shortDay(r.date) : null].filter(Boolean).join(", ");
      return { name: r.name, amount: formatEuro(r.amount), when };
    });
    weekHtml = `<p style="margin:24px 0 8px;font-size:15px;font-weight:600;color:#111827;">Da pagare questa settimana</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;color:#374151;">
      ${rows.map(r => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${escapeHtml(r.name)}<br /><span style="font-size:12px;color:#6b7280;">${escapeHtml(r.when)}</span></td>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;">${r.amount}</td>
      </tr>`).join("")}
    </table>`;
    weekText = `\n\nDa pagare questa settimana:\n${rows.map(r => `- ${r.name}: ${r.amount} (${r.when})`).join("\n")}`;
  }

  const content = `<p style="${P}">${escapeHtml(hello)}</p>
    ${main}
    ${weekHtml}
    <div style="margin:24px 0 8px;">${emailButton(button.href, button.label)}</div>`;

  const footerExtra = `Ti scriviamo il lunedì mattina perché hai un account Flusso.
    <a href="${escapeHtml(links.unsubscribe)}" style="color:#6b7280;">Non voglio più questa email</a> ·
    <a href="${escapeHtml(links.settings)}" style="color:#6b7280;">Avvisi in Account</a>`;

  const preheader = variant === "stale"
    ? "Bastano un minuto e il file della banca."
    : "La tua settimana in un numero, prima di iniziare.";

  const text = `${hello}\n\n${mainText}${weekText}\n\n${button.label.replace(" →", "")}: ${button.href}\n\n—\nTi scriviamo il lunedì mattina perché hai un account Flusso.\nNon voglio più questa email: ${links.unsubscribe}\nAvvisi in Account: ${links.settings}`;

  return { variant, subject, preheader, html: emailLayout(content, { preheader, footerExtra }), text };
}
