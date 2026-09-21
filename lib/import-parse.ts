// Lettura degli estratti conto (Excel/CSV) — funzioni pure, testate in tests/import-parse.test.ts.
//
// Il file arriva come "griglia" (righe di celle, come la restituisce SheetJS con header:1).
// 1) detectColumns riconosce da solo le intestazioni più comuni, anche con Entrate/Uscite
//    in colonne separate;
// 2) se non basta, sniffColumns propone una mappatura guardando i valori: la UI la mostra
//    all'utente con un'anteprima e NON la applica mai in silenzio (un "Saldo" scambiato
//    per "Importo" rovinerebbe i dati);
// 3) la mappatura confermata viene ricordata per quel tipo di file (rememberMap).

import { toISODate } from "./dates";

export type Grid = unknown[][];

export type ColumnMap = {
  /** indice della riga con le intestazioni, -1 se il file non ha intestazioni */
  headerRow: number;
  date: number;
  desc: number | null;
  category: number | null;
  /** importo con segno in un'unica colonna… */
  amount: number | null;
  /** …oppure Entrate e Uscite in due colonne */
  income: number | null;
  expense: number | null;
};

export type RawRow = { date: string; amount: number; description: string; bankCategory: string };

// ── testo ───────────────────────────────────────────────────────────────────

/** minuscolo, senza accenti, underscore e spazi multipli → uno spazio. */
export function normHeader(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// In ordine di preferenza: "data operazione" batte "data valuta".
const HEADERS = {
  date: ["data operazione", "data contabile", "data registrazione", "data movimento", "data", "date", "booking date", "started date", "completed date", "giorno", "data valuta", "data val"],
  amount: ["importo (eur)", "importo eur", "importo in euro", "importo", "amount (eur)", "amount", "valore"],
  income: ["entrate", "entrata", "accrediti", "accredito", "avere", "credit", "incoming"],
  expense: ["uscite", "uscita", "addebiti", "addebito", "dare", "debit", "outgoing"],
  // "operazione" prima di "dettaglio": è la colonna usata dall'import storico (Isybank), cambiarla
  // farebbe apparire come "possibili duplicati" i movimenti già importati (stessa data e importo, descrizione diversa).
  desc: ["descrizione completa", "operazione", "descrizione operazioni", "descrizione operazione", "descrizione", "causale", "dettaglio", "dettagli", "movimento", "description", "partner name", "payee", "wording", "note"],
  category: ["categoria", "category"],
} as const;

function findColumn(cells: string[], candidates: readonly string[], taken: number[]): number {
  const free = (i: number) => !taken.includes(i);
  for (const c of candidates) {
    const i = cells.findIndex((cell, idx) => free(idx) && cell === c);
    if (i !== -1) return i;
  }
  for (const c of candidates) {
    const i = cells.findIndex((cell, idx) => free(idx) && cell.startsWith(c));
    if (i !== -1) return i;
  }
  return -1;
}

/** Riconoscimento automatico da intestazioni note. null = serve la mappatura manuale. */
export function detectColumns(grid: Grid, maxScan = 40): ColumnMap | null {
  for (let i = 0; i < Math.min(maxScan, grid.length); i++) {
    const cells = (grid[i] ?? []).map(normHeader);
    const date = findColumn(cells, HEADERS.date, []);
    if (date === -1) continue;
    const amount = findColumn(cells, HEADERS.amount, [date]);
    const income = findColumn(cells, HEADERS.income, [date, amount]);
    const expense = findColumn(cells, HEADERS.expense, [date, amount, income]);
    const hasSplit = income !== -1 && expense !== -1;
    if (amount === -1 && !hasSplit) continue;
    const used = [date, amount, income, expense];
    const desc = findColumn(cells, HEADERS.desc, used);
    const category = findColumn(cells, HEADERS.category, [...used, desc]);
    return {
      headerRow: i,
      date,
      desc: desc === -1 ? null : desc,
      category: category === -1 ? null : category,
      amount: amount === -1 ? null : amount,
      income: amount === -1 && hasSplit ? income : null,
      expense: amount === -1 && hasSplit ? expense : null,
    };
  }
  return null;
}

// ── date e importi ──────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function validYMD(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** dd/mm/yyyy · dd-mm-yyyy · dd.mm.yyyy · dd/mm/yy · yyyy-mm-dd (con o senza ora) · seriale Excel · Date */
export function parseDate(raw: unknown): string | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : toISODate(raw);
  if (typeof raw === "number") {
    if (raw < 20000 || raw > 80000) return null; // seriali Excel plausibili: 1954–2119
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86_400_000); // floor: 45000.9 è ancora il giorno 45000
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:[T\s].*)?$/);
  if (iso) return validYMD(+iso[1], +iso[2], +iso[3]);

  const it = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?:[T\s].*)?$/);
  if (it) {
    let y = +it[3];
    if (it[3].length === 2) y += y < 70 ? 2000 : 1900;
    return validYMD(y, +it[2], +it[1]);
  }
  return null;
}

/** "1.234,56" · "1,234.56" · "-12,5" · "(12,50)" · "12,50-" · "€ 12,50" · "\u22123,10" · 12.5 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[\s\u00a0]/g, "").replace(/\u2212/g, "-");
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);

  s = s.replace(/[^\d.,]/g, ""); // via €, EUR, ecc.
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    // il separatore che compare per ultimo è quello decimale
    const dec = lastDot > lastComma ? "." : ",";
    const thousands = dec === "." ? /,/g : /\./g;
    s = s.replace(thousands, "");
    if (dec === ",") s = s.replace(",", ".");
  } else if (lastComma !== -1) {
    s = s.replace(/,/g, ".");
    if ((s.match(/\./g) ?? []).length > 1) return null;
  } else if (lastDot !== -1) {
    // "1.234" o "1.234.567" = migliaia all'italiana; "12.5" o "1234.56" = decimali
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// ── applicazione della mappatura ────────────────────────────────────────────

const cell = (row: unknown[], i: number | null) => (i === null ? undefined : row[i]);

export function parseWithMap(grid: Grid, map: ColumnMap): RawRow[] {
  const out: RawRow[] = [];
  for (let i = map.headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const date = parseDate(row[map.date]);
    if (!date) continue;

    let amount: number | null;
    if (map.amount !== null) {
      amount = parseAmount(cell(row, map.amount));
    } else {
      const inc = parseAmount(cell(row, map.income));
      const exp = parseAmount(cell(row, map.expense));
      amount = inc === null && exp === null ? null : Math.abs(inc ?? 0) - Math.abs(exp ?? 0);
    }
    if (amount === null) continue;

    out.push({
      date,
      amount,
      description: String(cell(row, map.desc) ?? "").trim(),
      bankCategory: String(cell(row, map.category) ?? "").trim(),
    });
  }
  return out;
}

// ── mappatura proposta guardando i valori ───────────────────────────────────

const nonEmpty = (row: unknown[]) => row.filter((c) => String(c ?? "").trim() !== "");

/**
 * Prima riga che contiene sia una data sia un importo = prima riga dati; la precedente,
 * se ha almeno due celle piene, è l'intestazione. Colonne scelte per frequenza dei valori
 * riconosciuti sulle righe successive. È solo una proposta da confermare.
 */
export function sniffColumns(grid: Grid, maxScan = 40): ColumnMap | null {
  let first = -1;
  for (let i = 0; i < Math.min(maxScan, grid.length); i++) {
    const row = grid[i] ?? [];
    const hasDate = row.some((c) => parseDate(c) !== null);
    const hasNumber = row.some((c) => parseDate(c) === null && parseAmount(c) !== null && String(c).trim() !== "");
    if (hasDate && hasNumber) { first = i; break; }
  }
  if (first === -1) return null;

  const width = Math.max(...grid.slice(first, first + 20).map((r) => (r ?? []).length));
  const sample = grid.slice(first, first + 20);
  const share = (col: number, test: (v: unknown) => boolean) =>
    sample.filter((r) => test((r ?? [])[col])).length / sample.length;

  let date = -1, bestDate = 0;
  for (let c = 0; c < width; c++) {
    const s = share(c, (v) => parseDate(v) !== null);
    if (s > bestDate) { bestDate = s; date = c; }
  }
  if (date === -1 || bestDate < 0.5) return null;

  const headerCells = first > 0 ? (grid[first - 1] ?? []).map(normHeader) : [];
  const isBalance = (c: number) => /saldo|balance/.test(headerCells[c] ?? "");

  let amount = -1, bestAmount = 0;
  for (let c = 0; c < width; c++) {
    if (c === date || isBalance(c)) continue;
    const s = share(c, (v) => parseDate(v) === null && String(v ?? "").trim() !== "" && parseAmount(v) !== null);
    if (s > bestAmount) { bestAmount = s; amount = c; }
  }
  if (amount === -1 || bestAmount < 0.5) return null;

  let desc = -1, bestLen = 0;
  for (let c = 0; c < width; c++) {
    if (c === date || c === amount) continue;
    const texts = sample.map((r) => String((r ?? [])[c] ?? "")).filter((t) => t && parseAmount(t) === null && parseDate(t) === null);
    if (texts.length < sample.length * 0.5) continue;
    const avg = texts.reduce((s, t) => s + t.length, 0) / texts.length;
    if (avg > bestLen) { bestLen = avg; desc = c; }
  }

  return {
    // Le righe prima della prima riga dati (intestazione, titoli, righe vuote) vengono comunque saltate.
    headerRow: first - 1,
    date,
    desc: desc === -1 ? null : desc,
    category: null,
    amount,
    income: null,
    expense: null,
  };
}

// ── mappatura ricordata per tipo di file ────────────────────────────────────

/** Impronta della riga di intestazione: uguale per tutti gli export della stessa banca. */
export function headerSignature(row: unknown[]): string {
  return nonEmpty(row).map(normHeader).join("|");
}

const STORE = "flusso_import_map:";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberMap(grid: Grid, map: ColumnMap, store: StorageLike | null = storage()): void {
  if (!store || map.headerRow < 0) return;
  const sig = headerSignature(grid[map.headerRow] ?? []);
  if (!sig) return;
  try { store.setItem(STORE + sig, JSON.stringify(map)); } catch { /* quota o modalità privata */ }
}

/** Cerca, tra le prime righe, un'intestazione già vista in passato e ne restituisce la mappatura. */
export function loadRememberedMap(grid: Grid, store: StorageLike | null = storage(), maxScan = 40): ColumnMap | null {
  if (!store) return null;
  for (let i = 0; i < Math.min(maxScan, grid.length); i++) {
    const sig = headerSignature(grid[i] ?? []);
    if (!sig) continue;
    try {
      const raw = store.getItem(STORE + sig);
      if (!raw) continue;
      const map = JSON.parse(raw) as ColumnMap;
      if (map.headerRow === i) return map;
    } catch { /* valore corrotto: si ignora */ }
  }
  return null;
}
