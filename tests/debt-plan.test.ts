import { test } from "node:test";
import assert from "node:assert/strict";
import { debtFromLastMonth, debtToMonths, debtEndDate } from "../lib/debt-plan";
import { dueInPeriod } from "../lib/fixed-expenses";
import { computeDebtProgress } from "../lib/calculations";
import { toISODate } from "../lib/dates";

const TODAY = "2026-11-12";
const now = new Date(TODAY + "T00:00:00");

test("rate fino a quando: 150 € al mese fino a dic 2027, contate da questo mese", () => {
  const d = debtFromLastMonth({ monthly: 150, lastMonth: "2027-12", today: TODAY });
  assert.deepEqual(d, { totalAmount: 2100, startDate: "2026-11-01", installments: 14 });

  // Con i campi ricavati, il calcolo di sempre dà la stessa ultima rata.
  const p = computeDebtProgress({ totalAmount: d!.totalAmount, monthlyAmount: 150, startDate: d!.startDate }, now);
  assert.equal(p.totalMonths, 14);
  assert.equal(toISODate(p.endDate).slice(0, 7), "2027-12");
  assert.equal(p.status, "active");
  assert.equal(p.monthsRemaining, 13);
  assert.equal(p.remaining, 1950);
});

test("rate fino a quando: con la prima rata si conta tutto il piano", () => {
  const d = debtFromLastMonth({ monthly: 150, lastMonth: "2027-12", today: TODAY, firstMonth: "2026-01" });
  assert.deepEqual(d, { totalAmount: 3600, startDate: "2026-01-01", installments: 24 });
  const p = computeDebtProgress({ totalAmount: 3600, monthlyAmount: 150, startDate: "2026-01-01" }, now);
  assert.equal(p.monthsElapsed, 11);       // gen–nov 2026
  assert.equal(p.paidSoFar, 1650);
  assert.equal(toISODate(p.endDate).slice(0, 7), "2027-12");
});

test("rate fino a quando: l'ultima rata questo mese, e una rata che parte più avanti", () => {
  assert.deepEqual(debtFromLastMonth({ monthly: 80, lastMonth: "2026-11", today: TODAY }),
    { totalAmount: 80, startDate: "2026-11-01", installments: 1 });

  const d = debtFromLastMonth({ monthly: 60, lastMonth: "2027-05", today: TODAY, firstMonth: "2027-01" });
  assert.deepEqual(d, { totalAmount: 300, startDate: "2027-01-01", installments: 5 });
  assert.equal(computeDebtProgress({ totalAmount: 300, monthlyAmount: 60, startDate: d!.startDate }, now).status, "future");
});

test("rate fino a quando: dati che non tornano", () => {
  assert.equal(debtFromLastMonth({ monthly: 0, lastMonth: "2027-12", today: TODAY }), null);
  assert.equal(debtFromLastMonth({ monthly: NaN, lastMonth: "2027-12", today: TODAY }), null);
  assert.equal(debtFromLastMonth({ monthly: 100, lastMonth: "", today: TODAY }), null);
  assert.equal(debtFromLastMonth({ monthly: 100, lastMonth: "2027-13", today: TODAY }), null);
  // ultima rata già passata, e ultima prima della prima
  assert.equal(debtFromLastMonth({ monthly: 100, lastMonth: "2026-10", today: TODAY }), null);
  assert.equal(debtFromLastMonth({ monthly: 100, lastMonth: "2026-03", today: TODAY, firstMonth: "2026-05" }), null);
});

test("rate: la virgola mobile non aggiunge una rata in più", () => {
  // 50,05 × 3 = 150,15, ma 150,15 / 50,05 in virgola mobile fa 3,0000000000000004
  const d = debtFromLastMonth({ monthly: 50.05, lastMonth: "2027-01", today: TODAY });
  assert.equal(d!.installments, 3);
  const p = computeDebtProgress({ totalAmount: d!.totalAmount, monthlyAmount: 50.05, startDate: d!.startDate }, now);
  assert.equal(p.totalMonths, 3);
  assert.equal(toISODate(p.endDate).slice(0, 7), "2027-01");
  // un importo che non è un multiplo della rata ha ancora l'ultima rata più piccola
  assert.equal(computeDebtProgress({ totalAmount: 1000, monthlyAmount: 300, startDate: "2026-11-01" }, now).totalMonths, 4);
});

test("rate: riaperta in modifica, torna come era stata inserita", () => {
  const d = debtFromLastMonth({ monthly: 150, lastMonth: "2027-12", today: TODAY, firstMonth: "2026-01" })!;
  assert.deepEqual(debtToMonths({ totalAmount: d.totalAmount, monthly: 150, startDate: d.startDate }),
    { firstMonth: "2026-01", lastMonth: "2027-12" });
  assert.deepEqual(debtToMonths({ totalAmount: 150.15, monthly: 50.05, startDate: "2026-11-01" }),
    { firstMonth: "2026-11", lastMonth: "2027-01" });
  // importo che non è un numero intero di rate: si riapre con importo totale e inizio
  assert.equal(debtToMonths({ totalAmount: 1000, monthly: 300, startDate: "2026-11-01" }), null);
  assert.equal(debtToMonths({ totalAmount: 1000, monthly: 0, startDate: "2026-11-01" }), null);
});

test("rate: la data di fine salvata tiene dentro l'ultima rata", () => {
  const d = debtFromLastMonth({ monthly: 150, lastMonth: "2027-12", today: TODAY })!;
  const p = computeDebtProgress({ totalAmount: d.totalAmount, monthlyAmount: 150, startDate: d.startDate }, now);
  assert.equal(debtEndDate(p.endDate, 27), "2027-12-27");
  assert.equal(debtEndDate(p.endDate, null), "2027-12-01");
  assert.equal(debtEndDate(new Date(2027, 1, 1), 31), "2027-02-28");

  // con la scadenza il 27, la rata di dicembre 2027 conta e quella di gennaio 2028 no
  const rata = { frequency: "mensile", custom_days: null, due_day: 27, due_month: null,
    end_date: debtEndDate(p.endDate, 27), debt_start_date: d.startDate };
  assert.equal(dueInPeriod(rata, "2027-12-01", "2027-12-31").count, 1);
  assert.equal(dueInPeriod(rata, "2028-01-01", "2028-01-31").count, 0);
  // e la prima, a novembre 2026, conta anche se la data di inizio è il 1°
  assert.equal(dueInPeriod(rata, "2026-11-01", "2026-11-30").count, 1);
});
