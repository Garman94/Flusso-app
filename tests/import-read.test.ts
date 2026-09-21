import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeCsv, readGrid } from "../lib/import-read";
import { detectColumns, parseWithMap } from "../lib/import-parse";

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const utf8 = (s: string) => toBuffer(new TextEncoder().encode(s));

const CSV_ITALIANO = [
  "Data;Data Valuta;Entrate;Uscite;Descrizione;Descrizione_Completa",
  "01.09.2026;01.09.2026;;45,30;Pagamento POS;ESSELUNGA MILANO",
  "02.09.2026;02.09.2026;1.800,00;;Bonifico;STIPENDIO SETTEMBRE",
  "05/09/2026;05/09/2026;;12,99;Addebito;NETFLIX.COM",
].join("\n");

test("CSV italiano: le celle restano testo, niente virgola-migliaia né date americane", () => {
  const grid = readGrid(utf8(CSV_ITALIANO), "movimenti.csv");
  assert.equal(grid[1][3], "45,30"); // prima: 4530
  assert.equal(grid[2][2], "1.800,00"); // prima: 1.8
  assert.equal(grid[1][0], "01.09.2026"); // prima: il 9 gennaio
  assert.equal(grid[3][0], "05/09/2026"); // prima: il 9 maggio
});

test("CSV italiano: dall'file alle righe corrette", () => {
  const grid = readGrid(utf8(CSV_ITALIANO), "movimenti.csv");
  const rows = parseWithMap(grid, detectColumns(grid)!);
  assert.deepEqual(
    rows.map((r) => [r.date, r.amount]),
    [["2026-09-01", -45.3], ["2026-09-02", 1800], ["2026-09-05", -12.99]],
  );
});

test("CSV con BOM e con virgole come separatore di campo", () => {
  const grid = readGrid(utf8("﻿Data,Descrizione,Importo\n03/01/2026,Netflix,-12.99\n"), "a.csv");
  const rows = parseWithMap(grid, detectColumns(grid)!);
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.description]), [["2026-01-03", -12.99, "Netflix"]]);
});

test("CSV in Windows-1252: le lettere accentate si leggono bene", () => {
  // "Caffè" con è = 0xE8 (non è UTF-8 valido)
  const bytes = new Uint8Array([...new TextEncoder().encode("Data;Descrizione;Importo\n01/09/2026;Caff"), 0xe8, ...new TextEncoder().encode(";-1,20\n")]);
  assert.equal(decodeCsv(toBuffer(bytes)).includes("Caffè"), true);
});
