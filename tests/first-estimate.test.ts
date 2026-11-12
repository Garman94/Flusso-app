import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceAtPeriodStart, firstSpendEstimate } from "../lib/first-estimate";

const ZONES = ["UTC", "Europe/Rome", "America/New_York", "Pacific/Auckland"];

function inZones(fn: () => void) {
  const prev = process.env.TZ;
  try {
    for (const zone of ZONES) { process.env.TZ = zone; fn(); }
  } finally {
    process.env.TZ = prev;
  }
}

test("senza saldo non c'è stima", () => {
  assert.equal(firstSpendEstimate(null, 0, "2026-11-10"), null);
  assert.equal(firstSpendEstimate(Number.NaN, 0, "2026-11-10"), null);
});

test("mese solare: fino all'ultimo del mese, 10% da parte, decine per difetto", () => {
  inZones(() => {
    const e = firstSpendEstimate(1000, 0, "2026-11-10")!;
    assert.equal(e.from, "2026-11-01");
    assert.equal(e.until, "2026-11-30");
    assert.equal(e.days, 21);
    assert.equal(e.canSpend, 900);
    assert.equal(e.reserve, 100);
    assert.equal(e.perDay, 42); // 900 / 21 = 42,8 → per difetto
  });
});

test("giorno di paga: fino al giorno prima del prossimo stipendio", () => {
  inZones(() => {
    // stipendio il 27: il 27 novembre 2026 è venerdì, quindi il periodo finisce il 26
    const e = firstSpendEstimate(523.4, 27, "2026-11-10")!;
    assert.equal(e.from, "2026-10-27");
    assert.equal(e.until, "2026-11-26");
    assert.equal(e.days, 17);
    assert.equal(e.canSpend, 470); // 471,06 → 470
    assert.equal(e.reserve, 53.4);
    assert.equal(e.perDay, 27);
  });
});

test("stipendio di sabato: anticipato al venerdì, il periodo finisce il giovedì", () => {
  inZones(() => {
    // il 28 novembre 2026 è sabato → stipendio venerdì 27 → fine periodo giovedì 26
    assert.equal(firstSpendEstimate(500, 28, "2026-11-10")!.until, "2026-11-26");
  });
});

test("ultimo giorno del periodo: un giorno solo", () => {
  const e = firstSpendEstimate(200, 0, "2026-11-30")!;
  assert.equal(e.days, 1);
  assert.equal(e.canSpend, 180);
  assert.equal(e.perDay, 180);
});

test("cambio dell'ora legale nel mezzo: i giorni restano giusti", () => {
  inZones(() => {
    // in Italia l'ora cambia il 25 ottobre 2026
    assert.equal(firstSpendEstimate(300, 0, "2026-10-20")!.days, 12);
  });
});

test("saldo a zero, negativo o piccolo: niente da spendere", () => {
  for (const balance of [0, -150.5, 9]) {
    const e = firstSpendEstimate(balance, 0, "2026-11-10")!;
    assert.equal(e.canSpend, 0);
    assert.equal(e.perDay, 0);
    assert.ok(e.reserve >= 0);
  }
});

test("la quota da parte è sempre almeno il 10%", () => {
  for (const balance of [11, 99.99, 1234.56, 15000]) {
    const e = firstSpendEstimate(balance, 0, "2026-11-10")!;
    assert.ok(e.canSpend <= balance * 0.9 + 1e-9, `canSpend ${e.canSpend} per ${balance}`);
    assert.equal(e.canSpend % 10, 0);
    assert.ok(Math.abs(e.canSpend + e.reserve - balance) < 0.005);
  }
});

test("saldo a inizio periodo: toglie i movimenti da inizio periodo a oggi compreso", () => {
  const txs = [
    { date: "2026-10-30", amount: 1500 },  // prima del periodo: non conta
    { date: "2026-11-01", amount: -50 },
    { date: "2026-11-10", amount: -20 },   // oggi: conta
    { date: "2026-11-12", amount: -99 },   // data futura: non conta
  ];
  assert.equal(balanceAtPeriodStart(800, "2026-11-10", "2026-11-01", txs), 870);
  assert.equal(balanceAtPeriodStart(800, "2026-11-10", "2026-11-01", []), 800);
});
