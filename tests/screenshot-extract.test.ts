import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrompt, parseExtraction, MAX_EXTRACTED_ROWS,
  buildStatementPrompt, parseStatementExtraction, checkStatement,
} from "../lib/screenshot-extract";

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

// ── Estratto conto PDF ──

test("PDF: il prompt chiede saldi e movimenti, con la data di oggi", () => {
  const p = buildStatementPrompt(OGGI);
  assert.ok(p.includes("Oggi è il 2026-09-21"));
  assert.ok(p.includes("closing_balance") && p.includes("opening_balance"));
});

test("PDF: oggetto con saldi e movimenti, che tornano", () => {
  const raw = '{"opening_balance":1000,"closing_balance":"2.754,70","closing_date":"2026-08-31","transactions":[' +
    '{"date":"2026-08-05","amount":-45.3,"description":"Esselunga"},{"date":"2026-08-10","amount":1800,"description":"Stipendio"}]}';
  const r = parseStatementExtraction(raw, OGGI);
  assert.equal(r.transactions.length, 2);
  assert.deepEqual(r.balances, { opening: 1000, closing: 2754.7, closingDate: "2026-08-31" });
  assert.deepEqual(checkStatement(r.balances, r.transactions), { complete: true, missing: 0 });
});

test("PDF: se manca un movimento il controllo lo dice", () => {
  const r = parseStatementExtraction('{"opening_balance":1000,"closing_balance":954.7,"closing_date":null,"transactions":[{"date":"2026-08-05","amount":-20,"description":"Bar"}]}', OGGI);
  const c = checkStatement(r.balances, r.transactions)!;
  assert.equal(c.complete, false);
  assert.equal(c.missing, -25.3); // mancano 25,30 € di uscite
  assert.equal(r.balances.closingDate, null);
});

test("PDF: senza saldi il controllo non si fa", () => {
  const r = parseStatementExtraction('{"opening_balance":null,"closing_balance":null,"transactions":[{"date":"2026-08-05","amount":-20,"description":"Bar"}]}', OGGI);
  assert.equal(checkStatement(r.balances, r.transactions), null);
});

test("PDF: risposta tagliata, si tengono saldi e movimenti completi", () => {
  const raw = '{"opening_balance":500,"closing_balance":420,"closing_date":"2026-08-31","transactions":[{"date":"2026-08-01","amount":-10,"description":"A"},{"date":"2026-08-02","amount":-20,"descr';
  const r = parseStatementExtraction(raw, OGGI);
  assert.equal(r.truncated, true);
  assert.equal(r.transactions.length, 1);
  assert.deepEqual(r.balances, { opening: 500, closing: 420, closingDate: "2026-08-31" });
});

test("PDF: se il modello risponde col solo array va bene lo stesso", () => {
  const r = parseStatementExtraction('```json\n[{"date":"2026-08-05","amount":-20,"description":"Bar"}]\n```', OGGI);
  assert.equal(r.transactions.length, 1);
  assert.equal(r.balances.closing, null);
});
