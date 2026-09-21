import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, parseExtraction, MAX_EXTRACTED_ROWS } from "../lib/screenshot-extract";

const OGGI = "2026-09-21";

test("il prompt dice al modello la data di oggi e non usa esempi di anni passati", () => {
  const p = buildPrompt(OGGI);
  assert.ok(p.includes("Oggi è il 2026-09-21"));
  assert.ok(!p.includes("2024"));
});

test("risposta pulita: array JSON", () => {
  const r = parseExtraction('[{"date":"2026-09-12","amount":-45.3,"description":"Esselunga"},{"date":"2026-09-10","amount":1800,"description":"Stipendio"}]', OGGI);
  assert.deepEqual(r.transactions.map((t) => [t.date, t.amount]), [["2026-09-12", -45.3], ["2026-09-10", 1800]]);
  assert.equal(r.truncated, false);
  assert.equal(r.dropped, 0);
});

test("risposta dentro ```json … ```", () => {
  const r = parseExtraction('```json\n[{"date":"2026-09-12","amount":"-45,30","description":"Esselunga"}]\n```', OGGI);
  assert.deepEqual(r.transactions.map((t) => t.amount), [-45.3]); // importo dato come testo all'italiana
});

test("risposta tagliata a metà: si tengono le righe complete", () => {
  const raw = '[{"date":"2026-09-12","amount":-1,"description":"A"},{"date":"2026-09-11","amount":-2,"description":"B"},{"date":"2026-09-1';
  const r = parseExtraction(raw, OGGI);
  assert.equal(r.transactions.length, 2);
  assert.equal(r.truncated, true);
});

test("righe con data impossibile, nel futuro o senza importo vengono scartate", () => {
  const raw = JSON.stringify([
    { date: "2026-02-31", amount: -1, description: "31 febbraio" },
    { date: "2031-01-01", amount: -1, description: "troppo avanti" },
    { date: "2026-09-12", amount: "boh", description: "senza importo" },
    { date: "12/09/2026", amount: -1, description: "formato sbagliato" },
    { date: "2026-09-12", amount: -3, description: "buona" },
  ]);
  const r = parseExtraction(raw, OGGI);
  assert.deepEqual(r.transactions.map((t) => t.description), ["buona"]);
  assert.equal(r.dropped, 4);
});

test("testo non JSON → nessun movimento", () => {
  assert.deepEqual(parseExtraction("Mi dispiace, non vedo movimenti.", OGGI), { transactions: [], truncated: false, dropped: 0 });
});

test("tetto di righe", () => {
  const lista = Array.from({ length: MAX_EXTRACTED_ROWS + 30 }, (_, i) => ({ date: "2026-09-01", amount: -i - 1, description: `m${i}` }));
  const r = parseExtraction(JSON.stringify(lista), OGGI);
  assert.equal(r.transactions.length, MAX_EXTRACTED_ROWS);
  assert.equal(r.truncated, true);
});
