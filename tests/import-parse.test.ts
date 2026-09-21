import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  parseAmount,
  detectColumns,
  parseWithMap,
  sniffColumns,
  headerSignature,
  rememberMap,
  loadRememberedMap,
  type ColumnMap,
} from "../lib/import-parse";
import { guessCategoryName, guessFromDescription } from "../lib/categorize";

// ── date ────────────────────────────────────────────────────────────────────
test("parseDate: formati italiani, ISO, seriali Excel, ora finale", () => {
  assert.equal(parseDate("31/12/2025"), "2025-12-31");
  assert.equal(parseDate("1-9-2026"), "2026-09-01");
  assert.equal(parseDate("31.12.2025"), "2025-12-31");
  assert.equal(parseDate("05/03/26"), "2026-03-05");
  assert.equal(parseDate("2026-09-01"), "2026-09-01");
  assert.equal(parseDate("2026-09-01T10:22:33Z"), "2026-09-01");
  assert.equal(parseDate("01/09/2026 10:22"), "2026-09-01");
  assert.equal(parseDate(46266), "2026-09-01"); // seriale Excel
  assert.equal(parseDate(46266.9), "2026-09-01"); // con ora: stesso giorno
});

test("parseDate: rifiuta date impossibili e testo", () => {
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("13/13/2026"), null);
  assert.equal(parseDate("Data"), null);
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate(12), null); // non è un seriale plausibile
});

// ── importi ─────────────────────────────────────────────────────────────────
test("parseAmount: separatori italiani e anglosassoni", () => {
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("-1.234,56"), -1234.56);
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("1234.56"), 1234.56);
  assert.equal(parseAmount("12,5"), 12.5);
  assert.equal(parseAmount("1.234"), 1234); // migliaia all'italiana
  assert.equal(parseAmount("12.5"), 12.5);
  assert.equal(parseAmount(-42.1), -42.1);
});

test("parseAmount: segni, parentesi, simboli", () => {
  assert.equal(parseAmount("(12,50)"), -12.5);
  assert.equal(parseAmount("12,50-"), -12.5);
  assert.equal(parseAmount("−3,10"), -3.1); // segno meno unicode
  assert.equal(parseAmount("€ 12,50"), 12.5);
  assert.equal(parseAmount("+1.000,00 EUR"), 1000);
  assert.equal(parseAmount(" -7,00 "), -7);
});

test("parseAmount: non numerici → null", () => {
  for (const v of ["", "  ", "abc", "Importo", null, undefined]) assert.equal(parseAmount(v), null);
});

// ── riconoscimento colonne (layout plausibili, non verificati su export reali) ─
const isybank = [
  ["Conti e carte"],
  ["Movimenti selezionati"],
  [],
  ["Data", "Operazione", "Dettagli", "Conto o carta", "Contabilizzazione", "Categoria", "Valuta", "Importo"],
  ["01/09/2026", "Pagamento POS", "ESSELUNGA MILANO", "Conto", "Contabilizzato", "Generi alimentari e supermercato", "EUR", "-45,30"],
  ["02/09/2026", "Bonifico", "STIPENDIO", "Conto", "Contabilizzato", "Stipendi e pensioni", "EUR", "1.800,00"],
];

const entrateUscite = [
  ["Data", "Data Valuta", "Entrate", "Uscite", "Descrizione", "Descrizione_Completa"],
  ["01/09/2026", "01/09/2026", "", "45,30", "Pagamento POS", "ESSELUNGA MILANO CARTA 1234"],
  ["02/09/2026", "02/09/2026", "1800,00", "", "Bonifico", "STIPENDIO SETTEMBRE"],
];

const addebitiAccrediti = [
  ["Data Contabile", "Data Valuta", "Addebiti", "Accrediti", "Descrizione operazioni"],
  ["01/09/2026", "01/09/2026", "12,00", "", "Commissioni"],
  ["05/09/2026", "05/09/2026", "", "300,00", "Bonifico ricevuto"],
];

const inglese = [
  ["Type", "Product", "Started Date", "Completed Date", "Description", "Amount", "Fee", "Currency", "State", "Balance"],
  ["CARD_PAYMENT", "Current", "2026-09-01 10:00:00", "2026-09-01 10:00:05", "Starbucks", "-3.50", "0.00", "EUR", "COMPLETED", "996.50"],
];

test("detectColumns: layout tipo Isybank/Intesa (importo con segno + categoria)", () => {
  const map = detectColumns(isybank)!;
  assert.equal(map.headerRow, 3);
  assert.equal(map.date, 0);
  assert.equal(map.amount, 7);
  assert.equal(map.category, 5);
  const rows = parseWithMap(isybank, map);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: "2026-09-01", amount: -45.3, description: "Pagamento POS", bankCategory: "Generi alimentari e supermercato" });
  assert.equal(rows[1].amount, 1800);
});

test("detectColumns: Entrate e Uscite in colonne separate", () => {
  const map = detectColumns(entrateUscite)!;
  assert.equal(map.amount, null);
  assert.equal(map.income, 2);
  assert.equal(map.expense, 3);
  assert.equal(map.desc, 5); // "Descrizione_Completa" batte "Descrizione"
  const rows = parseWithMap(entrateUscite, map);
  assert.deepEqual(rows.map((r) => r.amount), [-45.3, 1800]);
});

test("detectColumns: Addebiti / Accrediti", () => {
  const rows = parseWithMap(addebitiAccrediti, detectColumns(addebitiAccrediti)!);
  assert.deepEqual(rows.map((r) => r.amount), [-12, 300]);
  assert.equal(rows[0].date, "2026-09-01");
});

test("detectColumns: intestazioni inglesi, il saldo non viene scambiato per importo", () => {
  const map = detectColumns(inglese)!;
  assert.equal(map.amount, 5);
  const rows = parseWithMap(inglese, map);
  assert.equal(rows[0].amount, -3.5);
  assert.equal(rows[0].description, "Starbucks");
});

test("detectColumns: nessuna intestazione nota → null", () => {
  assert.equal(detectColumns([["colA", "colB", "colC"], ["x", "y", "z"]]), null);
});

// ── mappatura da valori (intestazioni sconosciute) ──────────────────────────
const senzaNomi = [
  ["Estratto conto gennaio"],
  ["Col1", "Col2", "Col3", "Col4"],
  ["03/01/2026", "PAGAMENTO CARTA NETFLIX", "-12,99", "1.500,00"],
  ["04/01/2026", "BONIFICO STIPENDIO", "1.800,00", "3.300,00"],
  ["05/01/2026", "ADDEBITO ENEL ENERGIA", "-80,10", "3.219,90"],
];

test("sniffColumns propone data, descrizione e importo guardando i valori", () => {
  const map = sniffColumns(senzaNomi)!;
  assert.equal(map.date, 0);
  assert.equal(map.desc, 1);
  assert.ok(map.amount === 2 || map.amount === 3, "importo o saldo: la UI chiede conferma");
  assert.equal(map.headerRow, 1);
});

test("sniffColumns esclude le colonne con intestazione Saldo", () => {
  const conSaldo = [
    ["Data", "Descrizione", "Saldo", "Importo"],
    ["03/01/2026", "NETFLIX", "1.500,00", "-12,99"],
    ["04/01/2026", "STIPENDIO", "3.300,00", "1.800,00"],
  ];
  assert.equal(sniffColumns(conSaldo)!.amount, 3);
});

// ── mappatura ricordata ─────────────────────────────────────────────────────
test("mappatura confermata: si ricorda per la stessa intestazione", () => {
  const memoria = new Map<string, string>();
  const store = { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v) };
  const map: ColumnMap = { headerRow: 1, date: 0, desc: 1, category: null, amount: 2, income: null, expense: null };
  assert.equal(loadRememberedMap(senzaNomi, store), null);
  rememberMap(senzaNomi, map, store);
  assert.deepEqual(loadRememberedMap(senzaNomi, store), map);
  // altra banca, altra intestazione → nessuna corrispondenza
  assert.equal(loadRememberedMap(isybank, store), null);
  assert.equal(headerSignature(["Data", "", "Importo "]), "data|importo");
});

// ── categorizzazione ────────────────────────────────────────────────────────
test("categorie: la categoria della banca ha la precedenza", () => {
  assert.equal(guessCategoryName("Farmacia", "QUALSIASI COSA"), "Salute");
});

test("categorie: parole chiave a parola intera e parola più lunga", () => {
  const cases: [string, string | null][] = [
    ["PAGAMENTO POS ESSELUNGA MILANO", "Alimentari"],
    ["ENI GAS E LUCE SPA", "Bollette"],
    ["ENI STATION 4021 SEGRATE", "Trasporti"],
    ["H&M 0123 MILANO", "Abbigliamento"],
    ["AMAZON PRIME VIDEO", "Intrattenimento"],
    ["Netflix.com", "Intrattenimento"],
    ["BAR CENTRALE", "Ristoranti"],
    ["BARILLA SPA", null], // "bar" non è una parola intera
    ["Caffè del Corso", "Ristoranti"],
    ["BONIFICO A MARIO ROSSI", null],
  ];
  for (const [text, expected] of cases) assert.equal(guessFromDescription(text), expected, text);
});
