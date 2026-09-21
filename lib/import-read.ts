// Da file a griglia di celle (input di lib/import-parse.ts). Testato in tests/import-read.test.ts.
//
// Perché i CSV passano da testo puro: SheetJS interpreta i CSV con le regole americane, quindi
// "45,30" diventava 4530 (la virgola come separatore delle migliaia) e "01.09.2026" il 9 gennaio.
// Con { raw: true } le celle restano stringhe e ci pensano parseAmount/parseDate, che conoscono
// il formato italiano. Gli .xlsx/.xls hanno invece numeri e date già tipizzati e vanno bene così.

import * as XLSX from "xlsx";
import type { Grid } from "./import-parse";

/** UTF-8 se valido, altrimenti Windows-1252: molte banche italiane esportano CSV in Windows-1252. */
export function decodeCsv(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return text.replace(/^﻿/, "");
}

export function readGrid(buffer: ArrayBuffer, filename: string): Grid {
  const isCsv = /\.csv$/i.test(filename);
  const wb = isCsv
    ? XLSX.read(decodeCsv(buffer), { type: "string", raw: true })
    : XLSX.read(new Uint8Array(buffer), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as Grid;
}
