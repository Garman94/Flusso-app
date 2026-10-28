// Import da screenshot e da estratto conto PDF: prompt e lettura della risposta del modello —
// funzioni pure, testate in tests/screenshot-extract.test.ts. Le chiamate all'API stanno in
// app/dashboard/transazioni/screenshot-action.ts.

import { parseAmount } from "./import-parse";

export type ExtractedTransaction = {
  date: string; // YYYY-MM-DD
  amount: number; // negativo = uscita, positivo = entrata
  description: string;
};

export const MAX_EXTRACTED_ROWS = 200;

export function buildPrompt(today: string): string {
  return `Analizza questo screenshot di un estratto conto o di una lista di movimenti bancari.
Estrai TUTTE le transazioni visibili.

Oggi è il ${today}. Se una data non riporta l'anno, usa l'anno più recente che non porti la data nel futuro rispetto a oggi.
Ignora i movimenti indicati come "in attesa", "non contabilizzato" o "prenotato" e non inventare nulla che non si veda.

Per ogni transazione restituisci:
- date: data in formato YYYY-MM-DD
- amount: importo numerico (negativo per uscite/addebiti/pagamenti, positivo per entrate/accrediti/bonifici ricevuti)
- description: descrizione breve del movimento (max 80 caratteri)

Restituisci SOLO un array JSON valido, senza markdown, senza testo prima o dopo.
Esempio di formato: [{"date":"2026-01-15","amount":-25.5,"description":"Supermercato"},{"date":"2026-01-14","amount":1500,"description":"Stipendio"}]`;
}

function isRealDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (y < 2000 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Recupera gli oggetti completi di un array JSON tagliato a metà (risposta interrotta per lunghezza). */
function salvageArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let cut = text.lastIndexOf("}");
  while (cut > start) {
    try {
      const parsed = JSON.parse(text.slice(start, cut + 1) + "]");
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      cut = text.lastIndexOf("}", cut - 1);
    }
  }
  return null;
}

export type Extraction = {
  transactions: ExtractedTransaction[];
  /** risposta interrotta: l'elenco è incompleto */
  truncated: boolean;
  /** righe scartate perché senza data valida o senza importo */
  dropped: number;
};

/**
 * Legge la risposta del modello: toglie i ``` di markdown, recupera un elenco tagliato,
 * scarta le righe con data impossibile (o nel futuro) o importo non numerico.
 */
export function parseExtraction(raw: string, today: string): Extraction {
  const text = raw.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let list: unknown[] | null = null;
  let truncated = false;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    list = salvageArray(text);
    truncated = list !== null;
  }
  if (!list) return { transactions: [], truncated: false, dropped: 0 };
  return cleanRows(list, today, truncated);
}

/** Tiene le righe con data vera (non oltre un anno da oggi) e importo numerico, al massimo MAX_EXTRACTED_ROWS. */
function cleanRows(list: unknown[], today: string, truncatedIn: boolean): Extraction {
  let truncated = truncatedIn;
  const maxDate = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`; // un anno di tolleranza
  const out: ExtractedTransaction[] = [];
  let dropped = 0;
  for (const item of list) {
    const t = (item ?? {}) as Record<string, unknown>;
    const date = typeof t.date === "string" ? t.date.trim() : "";
    const amount = parseAmount(t.amount);
    if (!isRealDate(date) || date > maxDate || amount === null) {
      dropped++;
      continue;
    }
    out.push({
      date,
      amount,
      description: String(t.description ?? "").trim().slice(0, 120),
    });
  }
  if (out.length > MAX_EXTRACTED_ROWS) {
    dropped += out.length - MAX_EXTRACTED_ROWS;
    out.length = MAX_EXTRACTED_ROWS;
    truncated = true;
  }
  return { transactions: out, truncated, dropped };
}

// ── Estratto conto PDF ───────────────────────────────────────────────────────

/** Saldi scritti nell'estratto conto: servono a controllare la lettura e a "Quadra" nei conti. */
export type StatementBalances = {
  opening: number | null;
  closing: number | null;
  /** data del saldo finale (fine del periodo dell'estratto conto) */
  closingDate: string | null;
};

export function buildStatementPrompt(today: string): string {
  return `Questo è un estratto conto bancario in PDF (anche di più pagine).
Estrai TUTTI i movimenti del periodo, pagina per pagina, senza saltarne nessuno.

Oggi è il ${today}. Se una data non riporta l'anno, usa l'anno del periodo dell'estratto conto.
Ignora i movimenti "in attesa", "non contabilizzati" o "prenotati", le righe di riepilogo e i totali.

Per ogni movimento:
- date: data contabile in formato YYYY-MM-DD
- amount: importo numerico (negativo per uscite/addebiti/dare, positivo per entrate/accrediti/avere)
- description: descrizione breve del movimento (max 80 caratteri)

Leggi anche i saldi del periodo, se ci sono:
- opening_balance: saldo iniziale (saldo contabile a inizio periodo)
- closing_balance: saldo finale (saldo contabile a fine periodo)
- closing_date: data del saldo finale, YYYY-MM-DD
Se un saldo non c'è, metti null. Non calcolarli tu.

Restituisci SOLO un oggetto JSON valido, senza markdown, senza testo prima o dopo, in questo formato:
{"opening_balance":1200.5,"closing_balance":980.1,"closing_date":"2026-01-31","transactions":[{"date":"2026-01-15","amount":-25.5,"description":"Supermercato"}]}`;
}

export type StatementExtraction = Extraction & { balances: StatementBalances };

const NO_BALANCES: StatementBalances = { opening: null, closing: null, closingDate: null };

/**
 * Legge la risposta per un PDF: un oggetto con saldi e movimenti. Se la risposta è tagliata
 * si salvano i movimenti completi (i saldi, scritti prima, restano se leggibili); se il modello
 * risponde con il solo array di movimenti, va bene lo stesso.
 */
export function parseStatementExtraction(raw: string, today: string): StatementExtraction {
  const text = raw.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  if (text.startsWith("[")) return { ...parseExtraction(text, today), balances: NO_BALANCES };

  const balancesFrom = (o: Record<string, unknown>): StatementBalances => {
    const closingDate = typeof o.closing_date === "string" && isRealDate(o.closing_date.trim()) ? o.closing_date.trim() : null;
    return { opening: parseAmount(o.opening_balance), closing: parseAmount(o.closing_balance), closingDate };
  };

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const list = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    return { ...cleanRows(list, today, false), balances: balancesFrom(parsed) };
  } catch {
    // tagliata: i saldi sono in testa, i movimenti si salvano fino all'ultimo completo
    const head: Record<string, unknown> = {};
    for (const key of ["opening_balance", "closing_balance", "closing_date"]) {
      const m = text.match(new RegExp(`"${key}"\\s*:\\s*("[^"]*"|-?[\\d.]+|null)`));
      if (m) head[key] = m[1] === "null" ? null : m[1].replace(/^"|"$/g, "");
    }
    const start = text.indexOf("[", text.indexOf('"transactions"'));
    const list = start >= 0 ? salvageArray(text.slice(start)) : null;
    if (!list) return { transactions: [], truncated: false, dropped: 0, balances: balancesFrom(head) };
    return { ...cleanRows(list, today, true), balances: balancesFrom(head) };
  }
}

export type StatementCheck = {
  /** saldo iniziale + movimenti letti = saldo finale (al centesimo) */
  complete: boolean;
  /** saldo finale − (saldo iniziale + movimenti letti): quanto manca all'appello */
  missing: number;
};

/**
 * Controlla la lettura con i saldi del PDF: se saldo iniziale più movimenti fa il saldo finale,
 * non è sfuggito niente. Senza tutti e due i saldi non si può dire.
 */
export function checkStatement(balances: StatementBalances, transactions: ExtractedTransaction[]): StatementCheck | null {
  if (balances.opening === null || balances.closing === null) return null;
  const sum = transactions.reduce((s, t) => s + t.amount, 0);
  const missing = Math.round((balances.closing - (balances.opening + sum)) * 100) / 100;
  return { complete: Math.abs(missing) < 0.01, missing };
}
