import { test } from "node:test";
import assert from "node:assert/strict";
import { inDaysLabel, upcomingItems, type UpcomingItem } from "../lib/upcoming";
import type { PlanTx } from "../lib/fixed-expenses";

// Periodo di paga dal 27 ottobre al 26 novembre, oggi 13 novembre. Importi inventati.
const FROM = "2026-10-27";
const TO = "2026-11-26";
const TODAY = "2026-11-13";

function item(over: Partial<UpcomingItem> & { id: string; name: string }): UpcomingItem {
  return {
    tipologia: "fissa",
    frequency: "mensile",
    custom_days: null,
    amount: 50,
    amount_max: null,
    due_day: null,
    due_month: null,
    match_keywords: [],
    secondary_name: null,
    end_date: null,
    last_paid_date: null,
    debt_type: null,
    next_due_date: null,
    ...over,
  };
}

const tx = (date: string, amount: number, description: string): PlanTx => ({ date, amount, description });

const affitto = item({ id: "a", name: "Affitto", amount: 600, due_day: 5, match_keywords: ["affitto"] });
const palestra = item({ id: "p", name: "Palestra", amount: 40, due_day: 20, match_keywords: ["palestra"] });
const telefono = item({ id: "t", name: "Telefono", amount: 10, due_day: 3, match_keywords: ["telefonia"] });
const netflix = item({ id: "n", name: "Streaming", amount: 13, due_day: 28 });
const rata = item({
  id: "r", name: "Finanziamento divano", amount: 100, due_day: 10, match_keywords: ["finanziamento"],
  debt_type: "rata_acquisto", debt_total_amount: 1200, debt_start_date: "2026-01-01",
});
const txs = [
  tx("2026-11-05", -600, "BONIFICO AFFITTO NOVEMBRE"),
  tx("2026-11-10", -100, "RATA FINANZIAMENTO"),
  tx("2026-11-12", -35, "SUPERMERCATO"),
];

test("stato di ogni voce, nell'ordine: non trovate, in arrivo, da verificare, pagate", () => {
  const rows = upcomingItems([affitto, palestra, telefono, netflix, rata], txs, FROM, TO, TODAY);
  assert.deepEqual(
    rows.map(r => [r.id, r.state]),
    [["t", "missing"], ["p", "upcoming"], ["n", "unverifiable"], ["a", "paid"], ["r", "paid"]],
  );
  const p = rows.find(r => r.id === "p")!;
  assert.equal(p.date, "2026-11-20");
  assert.equal(p.daysTo, 7);
  assert.equal(p.kind, "fixed");
  assert.equal(rows.find(r => r.id === "r")!.kind, "rate");
});

test("a parità di stato prima la scadenza più vicina", () => {
  const luce = item({ id: "l", name: "Luce", amount: 60, due_day: 16, match_keywords: ["energia"] });
  const rows = upcomingItems([palestra, luce], [], FROM, TO, TODAY);
  assert.deepEqual(rows.map(r => r.id), ["l", "p"]);
  assert.equal(rows[0].daysTo, 3);
});

test("pagata a mano in questo periodo ('L'ho pagata') conta come pagata", () => {
  const rows = upcomingItems([{ ...telefono, last_paid_date: "2026-11-13" }], [], FROM, TO, TODAY);
  assert.equal(rows[0].state, "paid");
});

test("restano fuori rate non iniziate o finite, spese che non cadono nel periodo ed entrate", () => {
  const futura = { ...rata, id: "f", debt_start_date: "2027-01-01" };
  const finita = { ...rata, id: "x", debt_start_date: "2024-01-01" };
  const annuale = item({ id: "y", name: "Assicurazione casa", frequency: "annuale", due_day: 1, due_month: 3, match_keywords: ["assicurazione"] });
  const stipendio = item({ id: "s", name: "Stipendio", tipologia: "entrata", due_day: 27 });
  assert.deepEqual(upcomingItems([futura, finita, annuale, stipendio], txs, FROM, TO, TODAY), []);
});

test("spese dell'anno: solo con la scadenza nel periodo", () => {
  const bollo = item({ id: "b", name: "Bollo auto", amount: 220, frequency: "annuale", next_due_date: "2026-11-22", saving_start_date: "2026-01-01" });
  const vacanza = item({ id: "v", name: "Vacanza", amount: 1500, frequency: "annuale", next_due_date: "2027-07-01", saving_start_date: "2026-08-01" });
  const scaduta = item({ id: "c", name: "Revisione", amount: 80, frequency: "annuale", next_due_date: "2026-11-02", saving_start_date: "2025-11-02" });
  const rows = upcomingItems([bollo, vacanza, scaduta], [], FROM, TO, TODAY);
  assert.deepEqual(rows.map(r => [r.id, r.kind, r.state, r.daysTo]), [
    ["c", "sinking", "missing", -11],
    ["b", "sinking", "upcoming", 9],
  ]);
});

test("importo variabile: il punto medio, come nelle previsioni", () => {
  const gas = item({ id: "g", name: "Gas", tipologia: "variabile", amount: 40, amount_max: 80, due_day: 18, match_keywords: ["gas"] });
  assert.equal(upcomingItems([gas], [], FROM, TO, TODAY)[0].amount, 60);
});

test("inDaysLabel", () => {
  assert.equal(inDaysLabel(0), "oggi");
  assert.equal(inDaysLabel(1), "domani");
  assert.equal(inDaysLabel(7), "tra 7 giorni");
  assert.equal(inDaysLabel(-2), null);
  assert.equal(inDaysLabel(null), null);
});
