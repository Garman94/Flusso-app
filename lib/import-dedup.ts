// ============================================================
// Anti-duplicati import Excel — funzioni pure.
//  - Livello 1: hash SHA-256 dell'intero file (stesso file ricaricato).
//  - Livello 2: classificazione riga per riga contro le transazioni
//    gia' presenti (stesso utente + stesso membro).
// ============================================================

export type DedupStatus = "new" | "possible" | "exact";

export type DedupRow = {
  date: string;
  amount: number;
  description: string;
};

export type ExistingTx = {
  date: string;
  amount: number;
  description: string | null;
};

// ─── Hash file (livello 1) ────────────────────────────────────────────────────
export async function hashFile(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Firma transazione (livello 2) ───────────────────────────────────────────
function normDesc(d: string | null | undefined): string {
  return (d ?? "").toLowerCase().trim();
}

/** Chiave "certa": data + importo. Le collisioni vere sono rare. */
function amountKey(date: string, amount: number): string {
  return `${date}|${amount.toFixed(2)}`;
}

/** Firma completa data+importo+inizio descrizione (per il match esatto). */
export function txSignature(date: string, amount: number, description: string): string {
  return `${date}|${amount.toFixed(2)}|${normDesc(description).slice(0, 20)}`;
}

// ─── Classificazione ─────────────────────────────────────────────────────────
export type ClassifiedRow<T extends DedupRow> = { row: T; status: DedupStatus };

export type DedupSummary = { neu: number; possible: number; exact: number };

/**
 * Per ogni riga del file determina se e' nuova, un possibile duplicato
 * (stessa data+importo, descrizione diversa) o un duplicato esatto.
 * O(n): costruisce due mappe dalle transazioni esistenti.
 */
export function classifyRows<T extends DedupRow>(
  rows: T[],
  existing: ExistingTx[],
): { classified: ClassifiedRow<T>[]; summary: DedupSummary } {
  const exactSet = new Set<string>();
  const amountMap = new Map<string, number>(); // data|importo -> quante ne esistono

  for (const t of existing) {
    exactSet.add(txSignature(t.date, Number(t.amount), t.description ?? ""));
    const k = amountKey(t.date, Number(t.amount));
    amountMap.set(k, (amountMap.get(k) ?? 0) + 1);
  }

  // Consumo progressivo: se un file contiene 2 righe identiche e ne esiste 1
  // sola, la prima e' "exact", la seconda torna "possible/new".
  const usedExact = new Set<string>();
  const summary: DedupSummary = { neu: 0, possible: 0, exact: 0 };

  const classified = rows.map(row => {
    const sig = txSignature(row.date, row.amount, row.description);
    const k = amountKey(row.date, row.amount);
    let status: DedupStatus;

    if (exactSet.has(sig) && !usedExact.has(sig)) {
      usedExact.add(sig);
      status = "exact";
    } else if ((amountMap.get(k) ?? 0) > 0) {
      amountMap.set(k, (amountMap.get(k) ?? 0) - 1);
      status = "possible";
    } else {
      status = "new";
    }

    if (status === "new") summary.neu++;
    else if (status === "possible") summary.possible++;
    else summary.exact++;

    return { row, status };
  });

  return { classified, summary };
}
