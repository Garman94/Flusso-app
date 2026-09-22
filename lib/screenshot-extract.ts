// Import da screenshot: prompt e lettura della risposta del modello — funzioni pure,
// testate in tests/screenshot-extract.test.ts. La chiamata all'API sta in
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
