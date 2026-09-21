import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectColumns,
  parseWithMap,
  parseWithMapDetailed,
  sniffColumns,
  isPendingStatus,
  type Grid,
} from "../lib/import-parse";

// Strutture di file reali ricavate dal codice di parser open source usati con quegli export
// (ofxstatement-intesasp, ofxstatement-fineco, ofxstatement-n26). I dati sono inventati:
// conta solo la forma. Dove il nome di una colonna NON è confermato dalla fonte, è indicato.

const vuote = (n: number): Grid => Array.from({ length: n }, () => []);

// Intesa Sanpaolo, formato nuovo (foglio "Lista Operazione"): intestazione dopo ~9 righe,
// stato "NON CONTABILIZZATO" per i movimenti in attesa, importo con segno.
const intesaV2: Grid = [
  ["Lista Operazione"], ["Conto: IT00 X000"], ...vuote(6),
  ["Data", "Operazione", "Dettagli", "Conto o carta", "Contabilizzazione", "Categoria", "Valuta", "Importo"],
  ["05/09/2026", "Pagamento POS", "ESSELUNGA MILANO", "Conto", "CONTABILIZZATO", "Generi alimentari e supermercato", "EUR", -45.3],
  ["06/09/2026", "Pagamento POS", "BAR CENTRALE", "Conto", "NON CONTABILIZZATO", "Ristoranti e bar", "EUR", -2.5],
  ["07/09/2026", "Bonifico", "STIPENDIO", "Conto", "CONTABILIZZATO", "Stipendi e pensioni", "EUR", 1800],
];

test("Intesa nuovo: i movimenti NON CONTABILIZZATO vengono saltati e contati", () => {
  const map = detectColumns(intesaV2)!;
  assert.equal(map.status, 4);
  const { rows, pending } = parseWithMapDetailed(intesaV2, map);
  assert.equal(pending, 1);
  assert.deepEqual(rows.map((r) => r.amount), [-45.3, 1800]);
  assert.equal(parseWithMap(intesaV2, map).length, 2);
});

test("stati che indicano un movimento non definitivo", () => {
  for (const v of ["NON CONTABILIZZATO", "Non contabilizzato", "In attesa", "PENDING", "DECLINED", "Da contabilizzare"]) {
    assert.equal(isPendingStatus(v), true, v);
  }
  for (const v of ["CONTABILIZZATO", "Contabilizzato", "COMPLETED", "", null]) {
    assert.equal(isPendingStatus(v), false, String(v));
  }
});

// Intesa Sanpaolo, formato vecchio (foglio "Lista Movimenti"): dati dalla riga 30, date con i punti,
// Accrediti e Addebiti in colonne separate. I titoli delle colonne non sono confermati dalla fonte.
const intesaV1Dati: Grid = [
  ["01.09.2026", "01.09.2026", "PAGAMENTO POS", "", "45,30", "ESSELUNGA MILANO", "POS"],
  ["02.09.2026", "02.09.2026", "BONIFICO", "1.800,00", "", "STIPENDIO SETTEMBRE", "BONIFICO"],
  ["03.09.2026", "03.09.2026", "PAGAMENTO POS", "", "12,99", "NETFLIX.COM", "POS"],
  ["04.09.2026", "04.09.2026", "PAGAMENTO POS", "", "8,00", "BAR CENTRALE", "POS"],
];

test("Intesa vecchio con titoli ipotizzati: riconosciuto, 28 righe di preambolo comprese", () => {
  const grid: Grid = [...vuote(28), ["Data contabile", "Data valuta", "Descrizione", "Accrediti", "Addebiti", "Descrizione estesa", "Mezzo"], ...intesaV1Dati];
  const map = detectColumns(grid)!;
  assert.equal(map.headerRow, 28);
  assert.deepEqual(parseWithMap(grid, map).map((r) => r.amount), [-45.3, 1800, -12.99, -8]);
});

test("Intesa vecchio con titoli sconosciuti: la proposta è Entrate/Uscite separate (non una sola colonna)", () => {
  const grid: Grid = [...vuote(28), ["C1", "C2", "C3", "C4", "C5", "C6", "C7"], ...intesaV1Dati];
  assert.equal(detectColumns(grid), null);
  const map = sniffColumns(grid)!;
  assert.equal(map.amount, null);
  assert.equal(map.income, 3); // a sinistra = entrate
  assert.equal(map.expense, 4);
  assert.deepEqual(parseWithMap(grid, map).map((r) => r.amount), [-45.3, 1800, -12.99, -8]);
});

test("Dare/Avere: l'ordine si capisce dai titoli (Dare = uscite, viene prima)", () => {
  const grid: Grid = [
    ["Data", "Descrizione", "Dare", "Avere"],
    ["01/09/2026", "ESSELUNGA", "45,30", ""],
    ["02/09/2026", "STIPENDIO", "", "1.800,00"],
    ["03/09/2026", "NETFLIX", "12,99", ""],
  ];
  // "Dare" e "Avere" sono riconosciuti già da detectColumns
  const map = detectColumns(grid)!;
  assert.deepEqual(parseWithMap(grid, map).map((r) => r.amount), [-45.3, 1800, -12.99]);
});

test("colonna importo con segno + colonna saldo: non diventa Entrate/Uscite", () => {
  const grid: Grid = [
    ["Data", "Descrizione", "Saldo", "Importo"],
    ["03/01/2026", "NETFLIX", "1.500,00", "-12,99"],
    ["04/01/2026", "STIPENDIO", "3.300,00", "1.800,00"],
    ["05/01/2026", "ENEL", "3.219,90", "-80,10"],
  ];
  const map = sniffColumns(grid)!;
  assert.equal(map.amount, 3);
  assert.equal(map.income, null);
});

test("importo con segno + colonna commissioni quasi vuota: resta una sola colonna importo", () => {
  const grid: Grid = [
    ["Data", "Descrizione", "Importo", "Commissioni"],
    ["03/01/2026", "NETFLIX", "-12,99", ""],
    ["04/01/2026", "PRELIEVO", "-100,00", "1,50"],
    ["05/01/2026", "ENEL", "-80,10", ""],
    ["06/01/2026", "STIPENDIO", "1.800,00", ""],
  ];
  const map = sniffColumns(grid)!;
  assert.equal(map.amount, 2);
  assert.equal(map.income, null);
});

// Fineco conto (xls): "Conto Corrente: …" in A1, riga finale "Totale". Colonne dal parser ofxstatement-fineco.
const finecoConto: Grid = [
  ["Conto Corrente: 0000000 - Intestatario"], [], [],
  ["Data", "Entrate", "Uscite", "Descrizione", "Descrizione_Completa", "Stato"],
  ["01/09/2026", "", 45.3, "Pagamento POS", "ESSELUNGA MILANO CARTA 1234", "Contabilizzato"],
  ["02/09/2026", 1800, "", "Bonifico", "STIPENDIO SETTEMBRE", "Contabilizzato"],
  ["Totale", 1800, 45.3, "", "", ""],
];

test("Fineco conto: Entrate/Uscite, descrizione completa, la riga Totale non è un movimento", () => {
  const map = detectColumns(finecoConto)!;
  assert.equal(map.desc, 4);
  const { rows, pending } = parseWithMapDetailed(finecoConto, map);
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.description]), [
    ["2026-09-01", -45.3, "ESSELUNGA MILANO CARTA 1234"],
    ["2026-09-02", 1800, "STIPENDIO SETTEMBRE"],
  ]);
  assert.equal(pending, 0);
});

// Fineco carta: 10 colonne, importo con segno
const finecoCarta: Grid = [
  ["Intestatario carta", "Numero carta", "Data operazione", "Data registrazione", "Descrizione", "Stato operazione", "Tipo operazione", "Circuito", "Tipo rimborso", "Importo"],
  ["MARIO ROSSI", "**** **** 1234", "01/09/2026", "02/09/2026", "ESSELUNGA MILANO", "Contabilizzata", "Acquisto", "Mastercard", "", -45.3],
];

test("Fineco carta: usa la data operazione e l'importo con segno", () => {
  const map = detectColumns(finecoCarta)!;
  assert.equal(map.date, 2);
  assert.equal(map.amount, 9);
  assert.deepEqual(parseWithMap(finecoCarta, map).map((r) => [r.date, r.amount]), [["2026-09-01", -45.3]]);
});

// N26: 11 colonne (posizioni confermate dal parser ofxstatement-n26; i titoli in inglese sono quelli standard)
const n26: Grid = [
  ["Booking Date", "Value Date", "Partner Name", "Partner Iban", "Type", "Payment Reference", "Account Name", "Amount (EUR)", "Original Amount", "Original Currency", "Exchange Rate"],
  ["2026-09-01", "2026-09-01", "Esselunga", "", "MasterCard Payment", "", "Main", -45.3, "", "", ""],
  ["2026-09-02", "2026-09-02", "Datore SRL", "IT00", "Income", "Stipendio", "Main", 1800, "", "", ""],
];

test("N26: data di registrazione, nome del partner e importo in EUR", () => {
  const rows = parseWithMap(n26, detectColumns(n26)!);
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.description]), [
    ["2026-09-01", -45.3, "Esselunga"],
    ["2026-09-02", 1800, "Datore SRL"],
  ]);
});
