import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecap, periodContaining, periodName, totals, type RecapTx } from "../lib/recap";
import type { PlanItem } from "../lib/fixed-expenses";

const cat = (name: string) => ({ name, icon: "•", color: "#000" });
const tx = (date: string, amount: number, category: string, description = category): RecapTx =>
  ({ date, amount, description, category_id: category.toLowerCase(), categories: cat(category) });

// periodi di paga del 27
const AGO = { from: "2026-07-27", to: "2026-08-26" };
const LUG = { from: "2026-06-27", to: "2026-07-26" };
const GIU = { from: "2026-05-27", to: "2026-06-26" };
const MAG = { from: "2026-04-27", to: "2026-05-26" };
const APR = { from: "2026-03-27", to: "2026-04-26" };
const STORICO = [LUG, GIU, MAG, APR];

const txs: RecapTx[] = [
  // agosto
  tx("2026-07-27", 2100, "Stipendio"),
  tx("2026-08-02", -800, "Casa", "Affitto"),
  tx("2026-08-05", -90, "Alimentari", "Esselunga"),
  tx("2026-08-16", -60, "Alimentari", "Esselunga"),
  tx("2026-08-16", -82, "Ristoranti", "Cena"),
  tx("2026-08-10", -13.99, "Intrattenimento", "Netflix"),
  tx("2026-08-25", -300, "Spostamenti", "Giroconto"),        // trasferimento: non conta
  // luglio
  tx("2026-06-27", 2100, "Stipendio"),
  tx("2026-07-02", -800, "Casa", "Affitto"),
  tx("2026-07-06", -120, "Alimentari", "Esselunga"),
  tx("2026-07-18", -40, "Ristoranti", "Pizza"),
  tx("2026-07-10", -13.99, "Intrattenimento", "Netflix"),
  // giugno
  tx("2026-05-27", 2100, "Stipendio"),
  tx("2026-06-02", -800, "Casa", "Affitto"),
  tx("2026-06-08", -100, "Alimentari", "Esselunga"),
  tx("2026-06-15", -30, "Ristoranti", "Bar"),
  // maggio: il primo mese caricato, comincia a metà (niente stipendio)
  tx("2026-05-05", -180, "Alimentari", "Esselunga"),
  tx("2026-05-20", -20, "Ristoranti", "Bar"),
  // aprile: niente
];

function plan(p: Partial<PlanItem>): PlanItem {
  return {
    id: "x", name: "Voce", tipologia: "fissa", frequency: "mensile", custom_days: null,
    amount: 10, amount_max: null, due_day: null, due_month: null, match_keywords: [],
    secondary_name: null, end_date: null, last_paid_date: null, debt_type: null,
    next_due_date: null, category_id: null, ...p,
  };
}
const affitto = plan({ name: "Affitto", amount: 800, due_day: 2, match_keywords: ["affitto"] });
const netflix = plan({ name: "Netflix", amount: 13.99, due_day: 10, match_keywords: ["netflix"] });
const spotify = plan({ name: "Spotify", amount: 10.99, due_day: 11, match_keywords: ["spotify"] });

test("riepilogo: entrate, uscite e quanto è rimasto, senza i giroconti", () => {
  const r = buildRecap(txs, AGO, STORICO);
  assert.equal(r.income, 2100);
  assert.equal(Math.round(r.expenses * 100) / 100, 1045.99);
  assert.equal(Math.round(r.saved * 100) / 100, 1054.01);
  assert.equal(Math.round(r.savedRate! * 100), 50);
  assert.equal(r.txCount, 7);
});

test("riepilogo: confronto col periodo prima, solo se è completo", () => {
  const r = buildRecap(txs, AGO, STORICO);
  assert.equal(r.prev && Math.round(r.prev.expenses * 100) / 100, 973.99);
  // giugno ha davanti maggio con dei movimenti: si confronta
  assert.notEqual(buildRecap(txs, LUG, [GIU, MAG, APR]).prev, null);
  // maggio è il primo mese caricato (prima non c'è niente): non si confronta
  assert.equal(buildRecap(txs, GIU, [MAG, APR]).prev, null);
});

test("riepilogo: 'il solito' usa solo i mesi completi", () => {
  const r = buildRecap(txs, AGO, STORICO);
  const alimentari = r.categories.find(c => c.id === "alimentari")!;
  assert.equal(alimentari.total, 150);
  assert.equal(alimentari.usual, (120 + 100) / 2); // maggio, il primo caricato, resta fuori
  assert.equal(r.categories[0].id, "casa");         // la più grande in cima
});

test("riepilogo: il primo mese caricato che comincia a metà è segnalato", () => {
  const r = buildRecap(txs, MAG, [APR]);
  assert.equal(r.startsLate, true);
  assert.equal(r.firstTxDate, "2026-05-05");
  assert.equal(buildRecap(txs, AGO, STORICO).startsLate, false);
});

test("riepilogo: budget senza spese fisse e rate, e superamenti", () => {
  const budgets = [
    { category_id: "alimentari", monthly_budget: 200 },
    { category_id: "ristoranti", monthly_budget: 60 },
    { category_id: "intrattenimento", monthly_budget: 5 }, // Netflix è una spesa fissa: non conta
  ];
  const r = buildRecap(txs, AGO, [LUG], budgets, [affitto, netflix]);
  assert.equal(r.budget!.count, 3);
  assert.equal(r.budget!.within, 2);
  assert.deepEqual(r.budget!.over, [{ name: "Ristoranti", by: 22 }]);
  assert.equal(r.categories.find(c => c.id === "intrattenimento")!.budgetSpent, 0);
});

test("riepilogo: curiosità senza affitto e abbonamenti", () => {
  const r = buildRecap(txs, AGO, [LUG], [], [affitto, netflix]);
  assert.equal(r.biggest!.description, "Esselunga");           // non l'affitto da 800
  assert.deepEqual(r.topDay, { date: "2026-08-16", total: 142 });
  const senzaPiano = buildRecap(txs, AGO, [LUG]);
  assert.equal(senzaPiano.biggest!.description, "Affitto");
});

test("riepilogo: spese fisse pagate nel periodo", () => {
  const r = buildRecap(txs, AGO, [LUG], [], [affitto, netflix, spotify], "2026-09-24");
  assert.deepEqual(r.fixed, { expected: 800 + 13.99 + 10.99, paid: 813.99, count: 3, paidCount: 2 });
});

test("riepilogo: avvisa se mancano gli ultimi giorni", () => {
  assert.equal(buildRecap(txs, AGO, []).maybeIncomplete, false);  // ultimo il 25, fine il 26
  assert.equal(buildRecap(txs, LUG, []).maybeIncomplete, true);   // ultimo il 18, fine il 26
});

test("riepilogo: totali di una lista qualsiasi", () => {
  assert.deepEqual(totals([tx("2026-08-01", 100, "Stipendio"), tx("2026-08-02", -30, "Casa"), tx("2026-08-03", -50, "Salvadanaio")]),
    { income: 100, expenses: 30, saved: 70 });
});

test("periodi: quello che contiene una data, e il nome da persona", () => {
  assert.deepEqual(periodContaining(27, "2026-08-10"), { from: "2026-07-27", to: "2026-08-26", year: 2026, month: 6 });
  assert.deepEqual(periodName(27, AGO), { month: "agosto", year: 2026, range: "27 lug – 26 ago" });
  const sett = periodContaining(0, "2026-09-15");
  assert.deepEqual([sett.from, sett.to], ["2026-09-01", "2026-09-30"]);
  assert.deepEqual(periodName(0, sett), { month: "settembre", year: 2026, range: null });
  assert.equal(periodName(10, { from: "2026-08-10", to: "2026-09-09" }).month, "agosto");
});

test("riepilogo: le uscite nei gruppi sommano al totale, con previsto e speso", () => {
  const budgets = [
    { category_id: "alimentari", monthly_budget: 200 },
    { category_id: "ristoranti", monthly_budget: 60 },
  ];
  const names = ["Casa", "Intrattenimento", "Alimentari", "Ristoranti"].map(n => ({ id: n.toLowerCase(), name: n, icon: "•" }));
  const r = buildRecap(txs, AGO, [LUG], budgets, [affitto, netflix, spotify], "2026-09-24", names);
  const g = r.groups;
  // fisse: affitto (casa) e netflix + spotify (abbonamenti); spotify non trovata
  assert.equal(g.fisse!.spent, 813.99);
  assert.equal(Math.round(g.fisse!.planned * 100) / 100, 824.98);
  assert.deepEqual(g.fisse!.subgroups.map(s => [s.key, Math.round(s.planned * 100) / 100]), [["casa", 800], ["abbonamenti", 24.98]]);
  assert.equal(g.fisse!.subgroups[1].items.find(i => i.name === "Spotify")!.paid, false);
  // budget: previsto 260, speso 150 (alimentari) + 82 (ristoranti)
  assert.deepEqual([g.budget!.planned, g.budget!.spent], [260, 232]);
  assert.deepEqual(g.budget!.categories.map(c => [c.id, c.spent, c.planned]), [["alimentari", 150, 200], ["ristoranti", 82, 60]]);
  const parts = (g.fisse?.spent ?? 0) + (g.rate?.spent ?? 0) + (g.budget?.spent ?? 0) + (g.altre?.spent ?? 0) + (g.accantonamenti?.spent ?? 0);
  assert.equal(Math.round(parts * 100) / 100, Math.round(r.expenses * 100) / 100);
  assert.equal(g.altre, null);          // tutto il resto è fisso o a budget
  assert.equal(g.rate, null);
});

test("riepilogo: senza budget le spese vanno in 'altre', gli accantonamenti a parte", () => {
  const withSavings = [...txs, tx("2026-08-20", -200, "Accantonamenti", "Giroconto deposito")];
  const r = buildRecap(withSavings, AGO, [LUG]);
  assert.equal(r.groups.accantonamenti!.spent, 200);
  assert.equal(r.groups.fisse, null);
  assert.equal(r.groups.budget, null);
  assert.equal(r.groups.altre!.categories[0].id, "casa");
  assert.equal(Math.round(r.groups.altre!.spent * 100) / 100, 1045.99);
});

test("riepilogo: rispetto al solito solo i cambi che contano", () => {
  const r = buildRecap(txs, AGO, STORICO);
  // alimentari 150 contro 110 di solito (+40); ristoranti 82 contro 35 (+47); casa e netflix uguali
  assert.deepEqual(r.changes.map(c => [c.id, Math.round(c.diff)]), [["ristoranti", 47], ["alimentari", 40]]);
});
