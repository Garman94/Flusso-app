import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysBetweenISO,
  daysLeftInclusive,
  dailyAllowance,
  spendable,
  shortDay,
  periodEndLabel,
} from "../lib/spendable";
import { projectPeriodEnd } from "../lib/calculations";
import { currentPeriod } from "../lib/period";
import { todayISO } from "../lib/dates";

const ZONES = ["UTC", "Europe/Rome", "America/New_York", "Pacific/Auckland"];

function inZone(zone: string, fn: () => void) {
  const prev = process.env.TZ;
  process.env.TZ = zone;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

for (const zone of ZONES) {
  test(`[${zone}] giorni rimasti col cambio dell'ora`, () => {
    inZone(zone, () => {
      // Fine marzo: il 29/3/2026 dura 23 ore in Italia.
      assert.equal(daysBetweenISO("2026-03-27", "2026-04-02"), 6);
      assert.equal(daysLeftInclusive("2026-03-27", "2026-04-02"), 7);
      // Fine ottobre: il 25/10/2026 dura 25 ore.
      assert.equal(daysLeftInclusive("2026-10-24", "2026-10-26"), 3);
      assert.equal(daysLeftInclusive("2026-10-27", "2026-11-26"), 31);
      // A cavallo dell'anno.
      assert.equal(daysLeftInclusive("2026-12-30", "2027-01-02"), 4);
    });
  });

  test(`[${zone}] periodo vero: dal 27 ott al 26 nov sono 31 giorni`, () => {
    inZone(zone, () => {
      const p = currentPeriod(27, new Date(2026, 9, 27, 12));
      assert.equal(p.from, "2026-10-27");
      assert.equal(p.to, "2026-11-26");
      assert.equal(daysLeftInclusive(p.from, p.to), 31);
    });
  });
}

test("oggi è l'ultimo giorno: tutto quello che resta è per oggi", () => {
  assert.equal(daysLeftInclusive("2026-11-26", "2026-11-26"), 1);
  assert.equal(dailyAllowance(42.5, "2026-11-26", "2026-11-26"), 42.5);
  // Periodo già finito (non dovrebbe succedere): mai dividere per zero o per un numero negativo.
  assert.equal(daysLeftInclusive("2026-11-28", "2026-11-26"), 1);
});

test("quota al giorno arrotondata per difetto al centesimo", () => {
  // 2 € in 7 giorni = 0,2857… → 0,28 (per difetto: meglio dire un po' meno che un po' di più).
  assert.equal(dailyAllowance(2, "2026-11-20", "2026-11-26"), 0.28);
  // Divisione esatta: niente centesimo perso per la virgola mobile (0,29 × 100 = 28,999…).
  assert.equal(dailyAllowance(0.29, "2026-11-26", "2026-11-26"), 0.29);
  assert.equal(dailyAllowance(8.7, "2026-11-24", "2026-11-26"), 2.9);
  assert.equal(dailyAllowance(0, "2026-11-20", "2026-11-26"), 0);
  assert.equal(dailyAllowance(-5, "2026-11-20", "2026-11-26"), 0);
});

test("senza budget per le spese libere non c'è un numero da mostrare", () => {
  const r = spendable({ flexiblePlanned: 0, leftToSpend: 0, endBalance: 500, today: "2026-11-10", periodTo: "2026-11-26" });
  assert.deepEqual(r, { kind: "no-budget" });
});

test("caso normale: budget non finito e soldi sul conto", () => {
  // Saldo 1.200, nessuna entrata in arrivo, affitto da pagare 600, budget 640 di cui spesi 240.
  const proj = projectPeriodEnd({
    balanceToday: 1200, incomeSoFar: 1800, expensesSoFar: 240,
    expectedIncome: 1800, expectedExpenses: 640, committedRemaining: 600,
  });
  const r = spendable({ flexiblePlanned: 640, leftToSpend: proj.leftToSpend, endBalance: proj.endBalance, today: "2026-11-10", periodTo: "2026-11-26" });
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.equal(r.amount, 400);
  assert.equal(r.capped, false);
  assert.equal(r.days, 17);
  assert.equal(r.perDay, 23.52); // 400 / 17 = 23,529…
});

test("il budget dice di più di quello che c'è sul conto: si mostra quello che c'è", () => {
  // Saldo 300, affitto ancora da pagare 250, budget libero rimasto 400: sul conto restano 50.
  const proj = projectPeriodEnd({
    balanceToday: 300, incomeSoFar: 0, expensesSoFar: 100,
    expectedIncome: 0, expectedExpenses: 500, committedRemaining: 250,
  });
  const r = spendable({ flexiblePlanned: 500, leftToSpend: proj.leftToSpend, endBalance: proj.endBalance, today: "2026-11-22", periodTo: "2026-11-26" });
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.equal(r.amount, 50);
  assert.equal(r.capped, true);
  assert.equal(r.perDay, 10);
});

test("lo stipendio in arrivo conta: si può spendere anche se oggi il conto è basso", () => {
  const proj = projectPeriodEnd({
    balanceToday: 100, incomeSoFar: 0, expensesSoFar: 0,
    expectedIncome: 1500, expectedExpenses: 400, committedRemaining: 0,
  });
  const r = spendable({ flexiblePlanned: 400, leftToSpend: proj.leftToSpend, endBalance: proj.endBalance, today: "2026-11-01", periodTo: "2026-11-30" });
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.equal(r.amount, 400);
  assert.equal(r.capped, false);
});

test("budget superato: quanto in più, non un numero negativo", () => {
  const proj = projectPeriodEnd({
    balanceToday: 900, incomeSoFar: 1800, expensesSoFar: 720.4,
    expectedIncome: 1800, expectedExpenses: 640, committedRemaining: 0,
  });
  const r = spendable({ flexiblePlanned: 640, leftToSpend: proj.leftToSpend, endBalance: proj.endBalance, today: "2026-11-20", periodTo: "2026-11-26" });
  assert.deepEqual(r, { kind: "over", amount: 80.4, days: 7 });
  // Budget finito esattamente: anche questo è "over" con 0, non "puoi spendere 0 €".
  const zero = spendable({ flexiblePlanned: 640, leftToSpend: 0, endBalance: 500, today: "2026-11-20", periodTo: "2026-11-26" });
  assert.equal(zero.kind, "over");
});

test("budget ancora aperto ma conto in rosso con le spese fisse da pagare", () => {
  // Saldo 200, mutuo da pagare 450, budget rimasto 100: mancano 250 anche senza spendere altro.
  const proj = projectPeriodEnd({
    balanceToday: 200, incomeSoFar: 0, expensesSoFar: 300,
    expectedIncome: 0, expectedExpenses: 400, committedRemaining: 450,
  });
  const r = spendable({ flexiblePlanned: 400, leftToSpend: proj.leftToSpend, endBalance: proj.endBalance, today: "2026-11-20", periodTo: "2026-11-26" });
  assert.deepEqual(r, { kind: "short", amount: 250, days: 7 });
});

test("etichetta del periodo e giorno corto", () => {
  assert.equal(shortDay("2026-11-26"), "26 nov");
  assert.equal(shortDay("2027-01-02"), "2 gen");
  assert.equal(periodEndLabel(27, "2026-11-26"), "Fino al prossimo stipendio (26 nov)");
  assert.equal(periodEndLabel(0, "2026-11-30"), "Fino a fine mese (30 nov)");
});

test("todayISO e periodo concordano anche verso mezzanotte", () => {
  // 23:30 del 26/11 a Roma = 22:30 UTC: è ancora l'ultimo giorno del periodo.
  const now = new Date(Date.UTC(2026, 10, 26, 22, 30));
  assert.equal(todayISO(now), "2026-11-26");
  assert.equal(daysLeftInclusive(todayISO(now), "2026-11-26"), 1);
});
