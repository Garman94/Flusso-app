import { test } from "node:test";
import assert from "node:assert/strict";
import { projectSinkingFund, aggregateSinkingFunds, sinkingFundInput, type SinkingFundInput } from "../lib/calculations";
import { emergencyLimit, planEmergency, sinkingGroups, upcomingDues } from "../lib/emergency";

const OGGI = new Date(2026, 9, 16); // 16 ottobre 2026
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≠ ${b}`);

// Assicurazione: scade questo mese · Bollo: il mese prossimo · Vacanza: a marzo
const assicurazione: SinkingFundInput = { id: "a", name: "Assicurazione", amount_per_cycle: 650, saving_start_date: "2025-11-01", next_due_date: "2026-10-20" };
const bollo: SinkingFundInput = { id: "b", name: "Bollo", amount_per_cycle: 200, saving_start_date: "2025-12-01", next_due_date: "2026-11-30" };
const vacanza: SinkingFundInput = { id: "c", name: "Vacanza", amount_per_cycle: 1200, saving_start_date: "2026-04-01", next_due_date: "2027-03-01" };
const voci = [assicurazione, bollo, vacanza];

test("accantonamenti: con quello già da parte la quota è il resto diviso i mesi", () => {
  const p = projectSinkingFund({ ...vacanza, saving_start_date: "2026-10-01", saved_offset: 300 }, OGGI);
  assert.equal(p.total_months, 6);         // ottobre … marzo
  assert.equal(p.monthly_quota, 150);      // (1200 − 300) / 6
  assert.equal(p.expected_saved_so_far, 450);
  // senza offset tutto come prima
  assert.equal(projectSinkingFund(vacanza, OGGI).monthly_quota, 100);
});

test("accantonamenti: la riga del database diventa l'input, offset compreso", () => {
  const input = sinkingFundInput({
    id: "x", name: "Gomme", tipologia: "variabile", amount: 400, amount_max: 600,
    saving_start_date: "2026-10-01", next_due_date: "2027-03-01", saving_offset: 100,
  });
  assert.equal(input.amount_per_cycle, 500);
  assert.equal(input.saved_offset, 100);
  assert.equal(sinkingFundInput({ ...input, tipologia: "fissa", amount: 10, amount_max: null, saving_offset: null }).saved_offset, 0);
});

test("emergenza: si lascia quello che esce questo mese e il prossimo", () => {
  const { thisMonth, nextMonth } = upcomingDues(voci, OGGI);
  assert.deepEqual(thisMonth.items.map(i => i.name), ["Assicurazione"]);
  assert.equal(thisMonth.total, 650);
  assert.deepEqual(nextMonth.items.map(i => i.name), ["Bollo"]);

  const limit = emergencyLimit(voci, 1600, OGGI);
  assert.equal(limit.reserve, 850);
  assert.equal(limit.max, 750);
  // nel salvadanaio non c'è abbastanza nemmeno per quelle: niente da prendere
  assert.equal(emergencyLimit(voci, 700, OGGI).max, 0);
});

test("emergenza: prima l'anticipo, poi la voce più lontana, e la sua quota sale", () => {
  const plan = planEmergency(voci, 1600, 500, OGGI);
  assert.equal(plan.exceeds, false);
  // previsti 650 + 183,33 + 700 = 1533,33: 66,67 erano in più
  near(plan.fromSurplus, 66.67);
  assert.equal(plan.items.length, 1);
  const v = plan.items[0];
  assert.equal(v.name, "Vacanza");
  near(v.taken, 433.33);
  assert.equal(v.savingStart, "2026-10-01");
  near(v.savingOffset, 166.67);       // fino a settembre 600, meno 433,33
  near(v.quotaBefore, 100);
  near(v.quotaAfter, 172.22);         // (1200 − 166,67) / 6 mesi
  near(plan.monthlyBefore, 116.67);   // bollo 16,67 + vacanza 100 (l'assicurazione è da pagare)
  near(plan.monthlyAfter, 188.89);

  // Con i nuovi valori il calcolo normale dà la stessa quota e arriva a 1200 a marzo.
  const dopo = { ...vacanza, saving_start_date: v.savingStart, saved_offset: v.savingOffset };
  near(projectSinkingFund(dopo, OGGI).monthly_quota, v.quotaAfter);
  near(projectSinkingFund(dopo, new Date(2027, 2, 1)).expected_saved_so_far, 1200);
  near(aggregateSinkingFunds([assicurazione, bollo, dopo], 1100, OGGI).this_month_total, plan.monthlyAfter);
});

test("emergenza: senza prelievo dalle voci la quota non cambia", () => {
  // ripartire da questo mese con quello che c'era fino a settembre dà la stessa quota
  near(projectSinkingFund({ ...vacanza, saving_start_date: "2026-10-01", saved_offset: 600 }, OGGI).monthly_quota, 100);
  const soloAnticipo = planEmergency(voci, 1600, 50, OGGI);
  assert.equal(soloAnticipo.items.length, 0);
  assert.equal(soloAnticipo.monthlyAfter, soloAnticipo.monthlyBefore);
});

test("emergenza: oltre il massimo si può, ma tocca le spese vicine e lo dice", () => {
  assert.equal(planEmergency(voci, 1600, 750, OGGI).exceeds, false);

  const oltre = planEmergency(voci, 1600, 800, OGGI);
  assert.equal(oltre.exceeds, true);
  assert.equal(oltre.uncovered, false);
  // anticipo 66,67 → Vacanza tutta (700) → il resto dal Bollo, che scade il mese prossimo
  assert.deepEqual(oltre.items.map(i => [i.name, i.near]), [["Vacanza", false], ["Bollo", true]]);
  const bollo = oltre.items[1];
  near(bollo.taken, 33.33);
  near(bollo.quotaAfter, 33.33);             // (200 − 133,33) in due mesi
  near(oltre.monthlyAfter, 250);             // bollo 33,33 + vacanza (1200 + 100) / 6
  near(aggregateSinkingFunds(voci.map(v => {
    const it = oltre.items.find(i => i.id === v.id);
    return it ? { ...v, saving_start_date: it.savingStart, saved_offset: it.savingOffset } : v;
  }), 0, OGGI).this_month_total, oltre.monthlyAfter);

  // tutto: anche l'assicurazione di questo mese, da rimettere entro la scadenza
  const tutto = planEmergency(voci, 1600, 1600, OGGI);
  const ass = tutto.items.find(i => i.name === "Assicurazione")!;
  assert.equal(ass.dueThisMonth, true);
  near(ass.taken, 650);
  near(projectSinkingFund({ ...assicurazione, saving_start_date: ass.savingStart, saved_offset: ass.savingOffset }, OGGI).expected_saved_so_far, 650);
  assert.equal(tutto.uncovered, false);

  // più di quanto c'è da parte per le voci: non si può
  assert.equal(planEmergency(voci, 1000, 1600, OGGI).uncovered, true);
});

test("emergenza: quali salvadanai tengono gli accantonamenti", () => {
  const pots = [{ id: "acc" }, { id: "emerg" }, { id: "viaggio" }];
  // collegati: ogni salvadanaio le sue voci
  assert.deepEqual(
    sinkingGroups(pots, ["viaggio"], [{ id: "a", savings_pot_id: "acc" }, { id: "b", savings_pot_id: "acc" }]),
    [{ potIds: ["acc"], itemIds: ["a", "b"] }],
  );
  // non collegati: tutti tranne quelli degli obiettivi, insieme
  assert.deepEqual(
    sinkingGroups(pots, ["viaggio"], [{ id: "a", savings_pot_id: null }]),
    [{ potIds: ["acc", "emerg"], itemIds: ["a"] }],
  );
  assert.deepEqual(sinkingGroups(pots, [], []), []);
});
