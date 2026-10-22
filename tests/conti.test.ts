import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceAt, totalAtStartOf, neededRange, reconcile, possibleDuplicates, type Account, type AccountTx } from "../lib/accounts";

// I conti di Marco al 22/10/2026: 728,42 € sul suo, 38 € su quello di Samira.
const marco: Account = { id: "m", name: "Conto Marco", member_id: "pm", anchor_balance: 728.42, anchor_date: "2026-10-22", checked_at: null };
const samira: Account = { id: "s", name: "Conto Samira", member_id: "ps", anchor_balance: 38, anchor_date: "2026-10-22", checked_at: null };

const txs: AccountTx[] = [
  { date: "2026-10-16", amount: -20, account_id: "m", description: "ESSELUNGA" },
  { date: "2026-10-20", amount: -12.5, account_id: "m", description: "BAR" },  // prima dell'ancora: già nel saldo
  { date: "2026-10-22", amount: -3, account_id: "m", description: "CAFFE" },   // il giorno dell'ancora: già nel saldo
  { date: "2026-10-23", amount: -40, account_id: "m", description: "ENI" },    // dopo: cambia il saldo
  { date: "2026-10-24", amount: 100, account_id: "s", description: "BONIFICO DA MARCO" },
  { date: "2026-10-24", amount: -9, account_id: null, description: "SENZA CONTO" }, // non conta per nessun conto
];

test("saldo di un conto: l'ancora più i movimenti dopo, quelli fino all'ancora sono già dentro", () => {
  assert.equal(balanceAt(marco, txs, "2026-10-22"), 728.42);
  assert.equal(balanceAt(marco, txs, "2026-10-23"), 688.42);
  assert.equal(balanceAt(samira, txs, "2026-10-25"), 138);
});

test("saldo prima dell'ancora: si tolgono i movimenti in mezzo", () => {
  // a fine 19/10 mancavano ancora il bar (20/10) e il caffè (22/10)
  assert.equal(balanceAt(marco, txs, "2026-10-19"), 743.92);
});

test("totale a inizio periodo e date da caricare", () => {
  // inizio del 23/10 = fine del 22/10: 728,42 + 38
  assert.equal(totalAtStartOf([marco, samira], txs, "2026-10-23"), 766.42);
  assert.deepEqual(neededRange([marco, samira], "2026-10-10"), { from: "2026-10-10", to: "2026-10-22" });
  assert.equal(neededRange([], "2026-10-10"), null);
});

test("quadra: uguale alla banca, oppure differenza con l'ultimo movimento caricato", () => {
  const ok = reconcile(marco, txs, 688.42, "2026-10-23");
  assert.equal(ok.ok, true);
  assert.equal(ok.diff, 0);

  const ko = reconcile(marco, txs, 650, "2026-10-28");
  assert.equal(ko.ok, false);
  assert.equal(ko.flusso, 688.42);
  assert.equal(ko.diff, -38.42);           // in banca c'è meno: probabilmente movimenti non caricati
  assert.equal(ko.lastMovement, "2026-10-23");
  assert.equal(ko.daysSinceLast, 5);
});

test("possibili doppioni nello stesso conto", () => {
  const dup: AccountTx[] = [
    ...txs,
    { date: "2026-10-23", amount: -40, account_id: "m", description: "eni " },
    { date: "2026-10-23", amount: -40, account_id: "s", description: "ENI" }, // altro conto: non è un doppione
  ];
  const d = possibleDuplicates(marco, dup, "2026-10-01");
  assert.equal(d.length, 1);
  assert.equal(d[0].count, 2);
  assert.equal(d[0].amount, -40);
});
