// Rate inserite come "quanto pago al mese e fino a quando".
// Chi ha un finanziamento di solito sa la rata e il mese dell'ultima, non l'importo
// finanziato né la data esatta di inizio. Da quei due dati ricaviamo i campi che le rate
// hanno sempre avuto (`debt_total_amount`, `debt_start_date`), così `computeDebtProgress`
// e tutto il resto (copertina, card, dashboard) continuano a funzionare senza modifiche.

export type DebtFromLastMonth = {
  /** Importo totale = rata × numero di rate, arrotondato al centesimo. */
  totalAmount: number;
  /** Primo giorno del mese della prima rata ("YYYY-MM-01"). */
  startDate: string;
  /** Numero di rate dalla prima all'ultima, comprese. */
  installments: number;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2027-12" → 2027 × 12 + 11: per contare i mesi tra due "YYYY-MM". */
const monthIndex = (ym: string) => +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1);

/**
 * Dalla rata mensile e dal mese dell'ultima rata ("YYYY-MM") ricava importo totale e data
 * di inizio. Senza `firstMonth` le rate si contano da questo mese (quelle già pagate non
 * le conosciamo); con `firstMonth` dalla prima rata vera.
 *
 * La data di inizio è sempre il giorno 1: con un giorno dopo oggi la rata risulterebbe
 * "non ancora iniziata" anche se la rata di questo mese c'è.
 *
 * null se i dati non tornano: rata non positiva, mese non valido, ultima rata prima della
 * prima (o, senza `firstMonth`, già passata).
 */
export function debtFromLastMonth(input: {
  monthly: number;
  lastMonth: string;
  today: string;
  firstMonth?: string | null;
}): DebtFromLastMonth | null {
  const { monthly, lastMonth, today } = input;
  if (!(monthly > 0) || !MONTH_RE.test(lastMonth)) return null;
  const first = input.firstMonth || today.slice(0, 7);
  if (!MONTH_RE.test(first)) return null;

  const installments = monthIndex(lastMonth) - monthIndex(first) + 1;
  if (installments < 1) return null;

  return {
    totalAmount: Math.round(monthly * installments * 100) / 100,
    startDate: `${first}-01`,
    installments,
  };
}

/**
 * Il contrario di `debtFromLastMonth`: se l'importo totale è un numero intero di rate
 * (al centesimo), mese della prima e dell'ultima rata ("YYYY-MM"). Serve per riaprire in
 * modifica una rata nello stesso modo in cui è stata inserita. null se non torna.
 */
export function debtToMonths(input: {
  totalAmount: number;
  monthly: number;
  startDate: string;
}): { firstMonth: string; lastMonth: string } | null {
  const { totalAmount, monthly, startDate } = input;
  if (!(monthly > 0) || !(totalAmount > 0) || !/^\d{4}-\d{2}/.test(startDate)) return null;
  const n = Math.round(totalAmount / monthly);
  if (n < 1 || Math.abs(n * monthly - totalAmount) > 0.01) return null;
  const firstMonth = startDate.slice(0, 7);
  const last = monthIndex(firstMonth) + n - 1;
  const lastMonth = `${Math.floor(last / 12)}-${String((last % 12) + 1).padStart(2, "0")}`;
  return { firstMonth, lastMonth };
}

/**
 * Valore da salvare in `end_date`: il giorno dell'ultima rata. `end_date` è un limite netto
 * (dueInPeriod, nextDueDate, findOverdueRecurring, riepilogo): con il giorno di
 * `computeDebtProgress` (quello della data di inizio, il 1° per le rate "fino a quando")
 * e un giorno di scadenza più avanti, l'ultima rata non conterebbe. Senza giorno di
 * scadenza resta la data di `computeDebtProgress`.
 */
export function debtEndDate(lastInstallment: Date, dueDay: number | null): string {
  const y = lastInstallment.getFullYear();
  const m = lastInstallment.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (dueDay == null || !(dueDay >= 1)) return `${y}-${pad(m + 1)}-${pad(lastInstallment.getDate())}`;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  return `${y}-${pad(m + 1)}-${pad(Math.min(Math.floor(dueDay), daysInMonth))}`;
}
