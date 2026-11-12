import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthYear, dayMonth, euro0, budgetSpend, budgetTotals, budgetStatus, fixedStatus,
  rateStatus, sinkingStatus, steadyFrom, goalsStatus, potsStatus, type CoverStatus,
} from "../lib/plan-cover";
import type { PlanItem } from "../lib/fixed-expenses";

// Intl mette uno spazio non separabile prima di €: nei confronti lo togliamo.
const txt = (s: CoverStatus) => s && s.text.replace(/ /g, " ");

function item(p: Partial<PlanItem>): PlanItem {
  return {
    id: "x", name: "Voce", tipologia: "fissa", frequency: "mensile", custom_days: null,
    amount: 10, amount_max: null, due_day: null, due_month: null, match_keywords: [],
    secondary_name: null, end_date: null, last_paid_date: null, debt_type: null,
    next_due_date: null, category_id: null, ...p,
  };
}

// periodo di paga del 27: 27 ott – 26 nov 2026
const FROM = "2026-10-27", TO = "2026-11-26";

// ── aiutanti ────────────────────────────────────────────────────────────────
test("copertina: mese e anno, giorno e mese, euro senza centesimi", () => {
  assert.equal(monthYear("2027-03-27"), "mar 2027");
  assert.equal(dayMonth("2026-11-07"), "7 nov");
  assert.equal(euro0(1150.4).replace(/ /g, " "), "1.150 €");
  assert.equal(euro0(-0.3).replace(/ /g, " "), "0 €"); // niente "-0 €"
});

// ── budget ──────────────────────────────────────────────────────────────────
const CATS = [
  { id: "spesa", name: "Supermercato" },
  { id: "bar", name: "Ristoranti" },
  { id: "acc", name: "Accantonamenti" },
  { id: "stip", name: "Stipendio" },     // entrata: non è una voce di budget
  { id: "giro", name: "Spostamenti" },   // giroconto: nemmeno
];

test("copertina budget: spesa netta del periodo, senza i pagamenti delle spese fisse", () => {
  const affitto = { date: "2026-11-01", amount: -500, category_id: "spesa" };
  const txs = [
    { date: "2026-11-02", amount: -80, category_id: "spesa" },
    { date: "2026-11-03", amount: 20, category_id: "spesa" },   // reso: abbassa la spesa
    { date: "2026-10-20", amount: -99, category_id: "spesa" },  // periodo prima
    { date: "2026-11-04", amount: -30, category_id: "bar" },
    { date: "2026-11-05", amount: 1500, category_id: "stip" },
    affitto,
  ];
  const spend = budgetSpend(CATS, txs, FROM, TO, new Set([affitto]));
  assert.deepEqual(spend, { spesa: 60, bar: 30, acc: 0 });
});

test("copertina budget: rimasti = budget del periodo meno speso, Accantonamenti con la quota", () => {
  const t = budgetTotals(CATS, { spesa: 300, bar: 100, acc: 999 }, { spesa: 60, bar: 30, acc: 50 }, "acc", 70);
  assert.deepEqual(t, { budget: 470, spent: 140, remaining: 330 });
  assert.deepEqual(budgetStatus(t), { text: "330 € rimasti", tone: "ok" });
});

test("copertina budget: oltre il budget, e senza budget nessuna riga", () => {
  assert.equal(txt(budgetStatus({ budget: 200, remaining: -45.6 })), "46 € oltre il budget");
  assert.equal(budgetStatus({ budget: 200, remaining: -45.6 })!.tone, "warn");
  assert.equal(txt(budgetStatus({ budget: 200, remaining: -0.4 })), "0 € rimasti"); // arrotondato
  assert.equal(budgetStatus({ budget: 0, remaining: 0 }), null);
});

// ── spese fisse ─────────────────────────────────────────────────────────────
const affitto = item({ name: "Affitto", due_day: 1, match_keywords: ["affitto"], amount: 500 });
const telefono = item({ name: "Telefono", due_day: 15, match_keywords: ["telefonia"], amount: 12 });
const palestra = item({ name: "Palestra", due_day: 20, match_keywords: ["palestra"], amount: 40 });
const pagAffitto = { date: "2026-11-01", amount: -500, description: "BONIFICO AFFITTO" };

test("copertina spese fisse: quelle di questa settimana", () => {
  // il 12 novembre: affitto pagato, telefono il 15 (questa settimana), palestra il 20 (fuori)
  const s = fixedStatus([affitto, telefono, palestra], [pagAffitto], FROM, TO, "2026-11-12");
  assert.deepEqual(s, { text: "1 da pagare questa settimana", tone: "neutral" });
});

test("copertina spese fisse: la prossima se nessuna arriva questa settimana", () => {
  const s = fixedStatus([affitto, palestra], [pagAffitto], FROM, TO, "2026-11-05");
  assert.equal(txt(s), "Prossima: Palestra il 20 nov");
});

test("copertina spese fisse: quelle che dovevano già arrivare vengono prima", () => {
  // il 19 novembre: telefono del 15 non trovato (oltre i 3 giorni), palestra il 20
  const s = fixedStatus([affitto, telefono, palestra], [pagAffitto], FROM, TO, "2026-11-19");
  assert.deepEqual(s, { text: "1 doveva già arrivare · 1 in arrivo questa settimana", tone: "warn" });
});

test("copertina spese fisse: tutto pagato", () => {
  const txs = [pagAffitto, { date: "2026-11-15", amount: -12, description: "TELEFONIA MOBILE" }];
  assert.deepEqual(fixedStatus([affitto, telefono], txs, FROM, TO, "2026-11-20"), { text: "Tutto pagato", tone: "ok" });
});

test("copertina spese fisse: senza parola chiave Flusso non sa se sono pagate", () => {
  const abbonamento = item({ name: "Streaming", due_day: 3 });
  assert.equal(txt(fixedStatus([affitto, abbonamento], [pagAffitto], FROM, TO, "2026-11-20")), "1 pagata · 1 da controllare tu");
  assert.equal(txt(fixedStatus([abbonamento], [], FROM, TO, "2026-11-20")), "1 da controllare tu");
});

test("copertina spese fisse: niente nel periodo, la prima del prossimo", () => {
  const bollo = item({ name: "Bollo", frequency: "annuale", due_day: 10, due_month: 1, match_keywords: ["bollo"] });
  assert.equal(txt(fixedStatus([bollo], [], FROM, TO, "2026-11-12")), "Prossima: Bollo il 10 gen");
});

test("copertina spese fisse: nessuna voce, solo quelle trovate nei movimenti", () => {
  assert.equal(txt(fixedStatus([], [], FROM, TO, "2026-11-12", 2)), "2 trovate nei tuoi movimenti");
  assert.equal(fixedStatus([], [], FROM, TO, "2026-11-12"), null);
});

// ── rate ────────────────────────────────────────────────────────────────────
const rata = (p: { amount: number; total: number; start: string }) =>
  ({ amount: p.amount, debt_type: "rata_acquisto", debt_total_amount: p.total, debt_start_date: p.start });

test("copertina rate: in corso e l'ultima rata", () => {
  // 150 € al mese per 14 mesi da novembre 2026: l'ultima a dicembre 2027
  assert.equal(txt(rateStatus([rata({ amount: 150, total: 2100, start: "2026-11-01" })], "2026-11-12")), "1 in corso · l'ultima rata a dic 2027");
  const due = [rata({ amount: 150, total: 2100, start: "2026-11-01" }), rata({ amount: 50, total: 300, start: "2026-09-05" })];
  assert.equal(txt(rateStatus(due, "2026-11-12")), "2 in corso · l'ultima finisce a dic 2027");
});

test("copertina rate: da iniziare e finite", () => {
  assert.equal(txt(rateStatus([rata({ amount: 100, total: 1200, start: "2026-12-10" })], "2026-11-12")), "Inizia a dic 2026");
  assert.deepEqual(rateStatus([rata({ amount: 100, total: 300, start: "2025-01-10" })], "2026-11-12"), { text: "Finita", tone: "ok" });
  assert.equal(rateStatus([{ amount: 10, debt_type: null, debt_total_amount: null, debt_start_date: null }], "2026-11-12"), null);
});

// ── spese dell'anno ─────────────────────────────────────────────────────────
test("copertina spese dell'anno: la prossima scadenza", () => {
  const voci = [
    { name: "Bollo", next_due_date: "2027-04-30" },
    { name: "Assicurazione", next_due_date: "2027-01-15" },
  ];
  assert.equal(txt(sinkingStatus(voci, "2026-11-12")), "Assicurazione tra 2 mesi");
  assert.equal(txt(sinkingStatus([{ name: "Regali", next_due_date: "2026-12-20" }], "2026-11-12")), "Regali il mese prossimo");
  assert.equal(txt(sinkingStatus([{ name: "Revisione", next_due_date: "2026-11-30" }], "2026-11-12")), "Revisione questo mese");
  assert.deepEqual(sinkingStatus([{ name: "Revisione", next_due_date: "2026-11-02" }], "2026-11-12"),
    { text: "Revisione: la scadenza è passata", tone: "warn" });
  assert.equal(sinkingStatus([], "2026-11-12"), null);
});

test("spese dell'anno: da quando la quota torna normale", () => {
  const oggi = "2026-11-12";
  assert.equal(steadyFrom(["2026-11-30"], oggi), "dal mese prossimo");
  assert.equal(steadyFrom(["2026-12-20"], oggi), "da gen 2027");
  // conta l'ultima scadenza in recupero: prima di allora la quota è ancora più alta
  assert.equal(steadyFrom(["2026-12-01", "2027-03-15"], oggi), "da apr 2027");
  assert.equal(steadyFrom(["2027-12-10"], oggi), "da gen 2028");
  assert.equal(steadyFrom(["2026-10-01"], oggi), "dal mese prossimo");
  assert.equal(steadyFrom([], oggi), "dal mese prossimo");
});

// ── obiettivi ───────────────────────────────────────────────────────────────
test("copertina obiettivi: il più vicino al traguardo", () => {
  const goals = [
    { name: "Vacanza", target_amount: 1000, current_amount: 605 },
    { name: "Bici", target_amount: 800, current_amount: 100 },
    { name: "Corso", target_amount: 300, current_amount: 300 }, // raggiunto: non si mostra
  ];
  assert.equal(txt(goalsStatus(goals)), "Vacanza: 60% · e altri 2");
  assert.equal(txt(goalsStatus(goals.slice(0, 2))), "Vacanza: 60% · e un altro");
  assert.equal(txt(goalsStatus([goals[1]])), "Bici: 12%");
});

test("copertina obiettivi: raggiunti, o nessun obiettivo", () => {
  assert.deepEqual(goalsStatus([{ name: "Corso", target_amount: 300, current_amount: 320 }]), { text: "Corso: raggiunto", tone: "ok" });
  assert.equal(txt(goalsStatus([
    { name: "A", target_amount: 10, current_amount: 10 }, { name: "B", target_amount: 10, current_amount: 12 },
  ])), "Tutti raggiunti");
  assert.equal(goalsStatus([]), null);
});

// ── salvadanai ──────────────────────────────────────────────────────────────
test("copertina salvadanai: quanto c'è in tutto", () => {
  assert.equal(txt(potsStatus([{ current_balance: 900 }, { current_balance: "250.40" }])), "1.150 € messi da parte");
  assert.equal(txt(potsStatus([{ current_balance: 0 }])), "Ancora vuoti");
  assert.equal(potsStatus([]), null);
});
