import { test } from "node:test";
import assert from "node:assert/strict";
import { toISODate, todayISO } from "../lib/dates";
import { computePeriodRange } from "../lib/period";
import {
  calculateDailyBalanceProjection,
  findOverdueRecurring,
  projectSinkingFund,
  computeDebtProgress,
  classifyCategoryMonths,
  suggestMonthlySavings,
} from "../lib/calculations";

// Il bug originale (toISOString().split("T")[0]) compariva solo a est di Greenwich:
// ogni test gira in più fusi orari per intercettarlo sia sul server (UTC) sia
// nel browser italiano (UTC+1/+2) sia altrove.
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
  test(`[${zone}] toISODate usa i componenti locali`, () => {
    inZone(zone, () => {
      assert.equal(toISODate(new Date(2026, 8, 1)), "2026-09-01");
      assert.equal(toISODate(new Date(2026, 11, 31)), "2026-12-31");
      assert.equal(toISODate(new Date(2026, 0, 5)), "2026-01-05");
    });
  });

  test(`[${zone}] periodo a mese solare`, () => {
    inZone(zone, () => {
      assert.deepEqual(computePeriodRange(0, 2026, 8), { from: "2026-09-01", to: "2026-09-30" });
      assert.deepEqual(computePeriodRange(0, 2026, 1), { from: "2026-02-01", to: "2026-02-28" });
    });
  });

  test(`[${zone}] periodo con giorno di paga`, () => {
    inZone(zone, () => {
      // 15 settembre 2026 è martedì, 15 ottobre giovedì: nessun aggiustamento weekend
      assert.deepEqual(computePeriodRange(15, 2026, 8), { from: "2026-09-15", to: "2026-10-14" });
      // 27 settembre 2026 è domenica → lunedì 28; 27 ottobre è martedì → il periodo finisce il 26
      assert.deepEqual(computePeriodRange(27, 2026, 8), { from: "2026-09-28", to: "2026-10-26" });
    });
  });

  test(`[${zone}] etichette date di proiezione e scadenze`, () => {
    inZone(zone, () => {
      const proj = calculateDailyBalanceProjection(1000, [], "2026-09-01", "2026-09-03");
      assert.deepEqual(proj.map((p) => p.date), ["2026-09-01", "2026-09-02", "2026-09-03"]);

      const overdue = findOverdueRecurring(
        [{
          id: "1", name: "Affitto", tipologia: "fissa", frequency: "mensile",
          due_day: 5, due_month: null, amount: 600, amount_max: null,
          last_paid_date: null, next_due_date: null, match_keywords: [], category_id: null,
        }],
        [],
        new Date(2026, 8, 20),
      );
      assert.equal(overdue[0].dueDate, "2026-09-05");
    });
  });
}

test("todayISO segue Europe/Rome, non il fuso della macchina", () => {
  // 22:30 UTC del 20/09 = 00:30 del 21/09 a Roma (CEST, UTC+2)
  const instant = new Date("2026-09-20T22:30:00Z");
  for (const zone of ZONES) inZone(zone, () => assert.equal(todayISO(instant), "2026-09-21"));
  // 21:30 UTC = 23:30 a Roma: ancora il 20
  assert.equal(todayISO(new Date("2026-09-20T21:30:00Z")), "2026-09-20");
});

// ── regressioni sui calcoli (valori verificati a mano) ─────────────────────────

test("accantonamento: 120 €/anno, 6 mesi trascorsi → 60 € messi da parte", () => {
  const p = projectSinkingFund(
    { id: "a", name: "Assicurazione", amount_per_cycle: 120, saving_start_date: "2026-01-01", next_due_date: "2026-12-31" },
    new Date(2026, 5, 13),
  );
  assert.equal(p.total_months, 12);
  assert.equal(p.monthly_quota, 10);
  assert.equal(p.months_elapsed, 6);
  assert.equal(p.expected_saved_so_far, 60);
});

test("rata: 1200 € a 100 €/mese da gennaio, a settembre restano 3 rate", () => {
  const d = computeDebtProgress({ totalAmount: 1200, monthlyAmount: 100, startDate: "2026-01-01" }, new Date(2026, 8, 20));
  assert.equal(d.totalMonths, 12);
  assert.equal(d.monthsElapsed, 9);
  assert.equal(d.monthsRemaining, 3);
  assert.equal(d.paidSoFar, 900);
  assert.equal(d.remaining, 300);
  assert.equal(d.status, "active");
});

test("mesi speciali: un mese >50% sopra la media è escluso", () => {
  const r = classifyCategoryMonths([300, 310, 290, 900, 305, 295].map((total, i) => ({ year: 2026, month: i + 1, total })));
  assert.equal(r.average, 300);
  assert.deepEqual(r.months.filter((m) => m.isSpecial).map((m) => m.total), [900]);
});

test("risparmio suggerito: 80% del potenziale, 20% di cuscinetto", () => {
  assert.deepEqual(suggestMonthlySavings(2000, 1200, 500), { rawPotential: 300, suggested: 240, buffer: 60, isTight: false });
  assert.equal(suggestMonthlySavings(1000, 900, 300).isTight, true);
});
