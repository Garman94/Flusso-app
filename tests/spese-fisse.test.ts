import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dueInPeriod, nextDueDate, findPayments, planStatus, splitPlan, planPayments, detectRecurring,
  isFixedExpense, expectedAmount, type PlanItem,
} from "../lib/fixed-expenses";
import { projectPeriodEnd } from "../lib/calculations";
import { ruleKeyword } from "../lib/categorize";

function item(p: Partial<PlanItem>): PlanItem {
  return {
    id: "x", name: "Voce", tipologia: "fissa", frequency: "mensile", custom_days: null,
    amount: 10, amount_max: null, due_day: null, due_month: null, match_keywords: [],
    secondary_name: null, end_date: null, last_paid_date: null, debt_type: null,
    next_due_date: null, category_id: null, ...p,
  };
}

// periodo di paga del 27: 27 ago – 26 set 2026
const FROM = "2026-08-27", TO = "2026-09-26";

// ── quando cade ─────────────────────────────────────────────────────────────
test("spese fisse: una mensile conta una volta per periodo, nella sua data", () => {
  const netflix = item({ due_day: 10 });
  assert.deepEqual(dueInPeriod(netflix, FROM, TO), { count: 1, dates: ["2026-09-10"], spread: false });
  const affitto = item({ due_day: 28 }); // cade il 28 agosto, dentro il periodo
  assert.deepEqual(dueInPeriod(affitto, FROM, TO).dates, ["2026-08-28"]);
});

test("spese fisse: una mensile conta una volta anche se i confini la tagliano fuori", () => {
  // periodo 28 ago – 25 set: il 27 non c'è, ma la spesa mensile c'è comunque una volta
  assert.equal(dueInPeriod(item({ due_day: 27 }), "2026-08-28", "2026-09-25").count, 1);
});

test("spese fisse: ogni 2 mesi cade solo nei mesi giusti", () => {
  const luce = item({ frequency: "bimestrale", due_day: 20, due_month: 7 }); // lug, set, nov…
  assert.deepEqual(dueInPeriod(luce, FROM, TO), { count: 1, dates: ["2026-09-20"], spread: false });
  assert.equal(dueInPeriod(luce, "2026-09-27", "2026-10-26").count, 0);        // ottobre no
  assert.deepEqual(dueInPeriod(luce, "2026-10-27", "2026-11-26").dates, ["2026-11-20"]);
});

test("spese fisse: annuale nel suo mese, e il 31 diventa l'ultimo del mese", () => {
  const prime = item({ frequency: "annuale", due_day: 31, due_month: 9 });
  assert.equal(dueInPeriod(prime, FROM, TO).count, 0);                     // il 30/9 è nel periodo dopo
  assert.deepEqual(dueInPeriod(prime, "2026-09-27", "2026-10-26").dates, ["2026-09-30"]);
  assert.deepEqual(dueInPeriod(prime, "2026-09-01", "2026-09-30").dates, ["2026-09-30"]);
});

test("spese fisse: ogni 2 mesi senza mese di riferimento → in media, metà al mese", () => {
  const gas = item({ frequency: "bimestrale", due_day: 5 });
  assert.deepEqual(dueInPeriod(gas, FROM, TO), { count: 0.5, dates: [], spread: true });
});

test("spese fisse: finita (end_date passata) non conta", () => {
  assert.equal(dueInPeriod(item({ due_day: 5, end_date: "2026-07-31" }), FROM, TO).count, 0);
});

test("spese fisse: prossima scadenza", () => {
  assert.equal(nextDueDate(item({ due_day: 10 }), "2026-09-24"), "2026-10-10");
  assert.equal(nextDueDate(item({ due_day: 30 }), "2026-09-24"), "2026-09-30");
  assert.equal(nextDueDate(item({ frequency: "bimestrale", due_day: 20, due_month: 7 }), "2026-09-24"), "2026-11-20");
  assert.equal(nextDueDate(item({ frequency: "annuale", due_day: 15, due_month: 3 }), "2026-09-24"), "2027-03-15");
  assert.equal(nextDueDate(item({ frequency: "bimestrale", due_day: 5 }), "2026-09-24"), null);
});

// ── pagamenti ───────────────────────────────────────────────────────────────
const txs = [
  { date: "2026-08-28", amount: -800, description: "BONIFICO AFFITTO AGOSTO" },
  { date: "2026-09-10", amount: -13.99, description: "PAGAMENTO POS NETFLIX.COM 10/09 CARTA 1234" },
  { date: "2026-09-12", amount: -310, description: "AMAZON MARKETPLACE" },
  { date: "2026-09-13", amount: -4.99, description: "AMAZON PRIME" },
  { date: "2026-09-14", amount: -54, description: "ESSELUNGA" },
];

test("pagamenti: riconosce per parola chiave e importo plausibile, il più vicino", () => {
  const prime = item({ amount: 4.99, match_keywords: ["amazon"] });
  assert.deepEqual(findPayments(prime, txs, 1).map(t => t.amount), [-4.99]); // non l'ordine da 310 €
  const netflix = item({ amount: 13.99, match_keywords: ["netflix"] });
  assert.equal(findPayments(netflix, txs, 1).length, 1);
  assert.equal(findPayments(item({ amount: 13.99 }), txs, 1).length, 0); // senza parola chiave
});

test("pagamenti: parole corte solo intere", () => {
  const tim = item({ amount: 10, match_keywords: ["tim"] });
  assert.equal(findPayments(tim, [{ date: "2026-09-01", amount: -10, description: "TIMBRIFICIO ROSSI" }], 1).length, 0);
  assert.equal(findPayments(tim, [{ date: "2026-09-01", amount: -10, description: "ADDEBITO SDD TIM SPA" }], 1).length, 1);
});

test("stato: pagata, in arrivo, mancante, non verificabile", () => {
  const today = "2026-09-24";
  const netflix = item({ amount: 13.99, due_day: 10, match_keywords: ["netflix"] });
  assert.equal(planStatus(netflix, txs, FROM, TO, today).state, "paid");
  const spotify = item({ amount: 10.99, due_day: 25, match_keywords: ["spotify"] });
  assert.equal(planStatus(spotify, txs, FROM, TO, today).state, "upcoming");
  const telefono = item({ amount: 9.99, due_day: 5, match_keywords: ["iliad"] });
  assert.equal(planStatus(telefono, txs, FROM, TO, today).state, "missing");
  assert.equal(planStatus({ ...telefono, due_day: 22 }, txs, FROM, TO, today).state, "upcoming"); // 2 giorni fa: tolleranza
  assert.equal(planStatus(item({ amount: 30, due_day: 5 }), txs, FROM, TO, today).state, "unverifiable");
  assert.equal(planStatus({ ...telefono, last_paid_date: "2026-09-06" }, txs, FROM, TO, today).state, "paid");
  const luceOtt = item({ frequency: "bimestrale", due_day: 20, due_month: 10, match_keywords: ["enel"] });
  assert.equal(planStatus(luceOtt, txs, FROM, TO, today).state, "not-due");
});

test("divisione: pagate fuori, da pagare a parte, le altre come prima", () => {
  const today = "2026-09-24";
  const statuses = [
    item({ amount: 13.99, due_day: 10, match_keywords: ["netflix"] }),      // pagata
    item({ amount: 10.99, due_day: 25, match_keywords: ["spotify"] }),      // da pagare
    item({ amount: 30, due_day: 5 }),                                        // senza parola chiave
    item({ frequency: "bimestrale", amount: 100, due_day: 5 }),             // in media: 50
    item({ frequency: "bimestrale", amount: 100, due_day: 5, due_month: 10 }), // non in questo periodo
  ].map(it => planStatus(it, txs, FROM, TO, today));
  const s = splitPlan(statuses);
  assert.equal(s.paidSpent, 13.99);
  assert.equal(s.remaining, 10.99);
  assert.equal(s.flexible, 80);
  assert.equal(Math.round(s.expected * 100) / 100, 13.99 + 10.99 + 30 + 50);
});

test("fine periodo: l'affitto ancora da pagare non è 'spendibile'", () => {
  // a inizio mese: budget 600, speso 0, affitto 800 ancora da pagare
  const p = projectPeriodEnd({
    balanceToday: 2000, incomeSoFar: 1800, expensesSoFar: 0,
    expectedIncome: 1800, expectedExpenses: 600, committedRemaining: 800,
  });
  assert.equal(p.leftToSpend, 600);
  assert.equal(p.remainingExpenses, 1400);
  assert.equal(p.endBalance, 600);
  // sforare il budget non fa sparire l'affitto dalla stima
  const q = projectPeriodEnd({
    balanceToday: 1300, incomeSoFar: 1800, expensesSoFar: 700,
    expectedIncome: 1800, expectedExpenses: 600, committedRemaining: 800,
  });
  assert.equal(q.remainingExpenses, 800);
  assert.equal(q.leftToSpend, -100);
  assert.equal(q.endBalance, 500);
});

test("budget: i pagamenti delle voci di Pianifica si tolgono periodo per periodo", () => {
  const netflix = item({ amount: 13.99, due_day: 10, match_keywords: ["netflix"] });
  const paid = planPayments([netflix], txs, [{ from: FROM, to: TO }]);
  assert.equal(paid.size, 1);
  assert.equal([...paid][0].amount, -13.99);
});

test("spese fisse: cosa è una spesa fissa e quanto vale", () => {
  assert.equal(isFixedExpense({ debt_type: null, next_due_date: null, tipologia: "fissa" }), true);
  assert.equal(isFixedExpense({ debt_type: "mutuo", next_due_date: null, tipologia: "fissa" }), false);
  assert.equal(isFixedExpense({ debt_type: null, next_due_date: "2027-01-01", tipologia: "fissa" }), false);
  assert.equal(isFixedExpense({ debt_type: null, next_due_date: null, tipologia: "entrata" }), false);
  assert.equal(expectedAmount({ tipologia: "variabile", amount: 80, amount_max: 120 }), 100);
});

// ── ricerca automatica ──────────────────────────────────────────────────────
const history = [
  // Netflix: ogni mese, stesso importo
  { date: "2026-06-12", amount: -13.99, description: "PAGAMENTO POS NETFLIX.COM", category_id: "svago" },
  { date: "2026-07-11", amount: -13.99, description: "PAGAMENTO POS NETFLIX.COM", category_id: "svago" },
  { date: "2026-08-10", amount: -13.99, description: "PAGAMENTO POS NETFLIX.COM", category_id: "svago" },
  { date: "2026-09-10", amount: -13.99, description: "PAGAMENTO POS NETFLIX.COM", category_id: "svago" },
  // bolletta mensile che cambia
  { date: "2026-07-21", amount: -110, description: "ADDEBITO DIRETTO SDD ENEL ENERGIA", category_id: "bollette" },
  { date: "2026-08-20", amount: -135, description: "ADDEBITO DIRETTO SDD ENEL ENERGIA", category_id: "bollette" },
  { date: "2026-09-22", amount: -98, description: "ADDEBITO DIRETTO SDD ENEL ENERGIA", category_id: "bollette" },
  // supermercato: più volte al mese → no
  { date: "2026-08-04", amount: -92, description: "ESSELUNGA" },
  { date: "2026-08-29", amount: -74, description: "ESSELUNGA" },
  { date: "2026-09-05", amount: -79, description: "ESSELUNGA" },
  // benzina: giorni e importi sparsi → no
  { date: "2026-07-03", amount: -64, description: "Q8 CARBURANTE" },
  { date: "2026-08-01", amount: -20, description: "Q8 CARBURANTE" },
  { date: "2026-08-29", amount: -58, description: "Q8 CARBURANTE" },
  // palestra smessa a giugno → no
  { date: "2026-05-02", amount: -40, description: "PALESTRA FIT" },
  { date: "2026-06-02", amount: -40, description: "PALESTRA FIT" },
  // giroconto ai risparmi (categoria esclusa) → no
  { date: "2026-08-27", amount: -200, description: "GIROCONTO DEPOSITO", category_id: "risparmio" },
  { date: "2026-09-26", amount: -200, description: "GIROCONTO DEPOSITO", category_id: "risparmio" },
  // entrata → no
  { date: "2026-08-27", amount: 2100, description: "STIPENDIO" },
  { date: "2026-09-27", amount: 2100, description: "STIPENDIO" },
];

test("ricerca automatica: trova abbonamenti e bollette mensili, non spesa e benzina", () => {
  const found = detectRecurring(history, [], "2026-09-24", new Set(["risparmio"]));
  assert.deepEqual(found.map(f => f.keyword), ["enel", "netflix"]);
  const enel = found[0];
  assert.equal(enel.amount, 98);
  assert.equal(enel.amountMax, 135);
  assert.equal(enel.dueDay, 21);
  assert.equal(enel.categoryId, "bollette");
  const netflix = found[1];
  assert.equal(netflix.amount, 13.99);
  assert.equal(netflix.amountMax, null);
  assert.equal(netflix.name, "Netflix");
});

test("ricerca automatica: il nome proposto è leggibile", () => {
  const rent = [
    { date: "2026-08-02", amount: -800, description: "Affitto", merchant: "Agenzia Immob." },
    { date: "2026-09-02", amount: -800, description: "Affitto", merchant: "Agenzia Immob." },
    { date: "2026-08-15", amount: -9.99, description: "ADDEBITO SDD ILIAD 0012345", merchant: "ILIAD" },
    { date: "2026-09-15", amount: -9.99, description: "ADDEBITO SDD ILIAD 0012346", merchant: "ILIAD" },
  ];
  assert.deepEqual(detectRecurring(rent, [], "2026-09-24").map(f => f.name), ["Affitto", "Iliad"]);
});

test("ricerca automatica: non ripropone quello che c'è già", () => {
  const found = detectRecurring(history, [{ match_keywords: ["netflix"], secondary_name: null }], "2026-09-24", new Set(["risparmio"]));
  assert.deepEqual(found.map(f => f.keyword), ["enel"]);
});

test("parola chiave: 'addebito diretto' non è un negozio", () => {
  assert.equal(ruleKeyword("ADDEBITO DIRETTO SDD FASTWEB SPA"), "fastweb");
});
