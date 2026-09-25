import { test } from "node:test";
import assert from "node:assert/strict";
import { rollBalance, projectPeriodEnd, potsForSinkingFunds } from "../lib/calculations";
import { computePeriodRange, getCurrentPeriodAnchor, currentPeriod, previousPeriods } from "../lib/period";
import { matchUserRule, ruleKeyword } from "../lib/categorize";

function inZone(zone: string, fn: () => void) {
  const prev = process.env.TZ;
  process.env.TZ = zone;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
}

// ── saldo riportato tra periodi ─────────────────────────────────────────────
const txs = [
  { date: "2026-08-27", amount: 2000 },  // stipendio del periodo vecchio
  { date: "2026-09-05", amount: -300 },
  { date: "2026-09-26", amount: -50 },   // ultimo giorno del periodo vecchio
  { date: "2026-09-27", amount: 2100 },  // primo giorno del nuovo: NON va nel riporto
];

test("saldo: stesso giorno → invariato", () => {
  assert.equal(rollBalance(1000, "2026-08-27", "2026-08-27", txs), 1000);
});

test("saldo: riportato in avanti sommando i movimenti del periodo precedente", () => {
  // 1000 a inizio vecchio periodo + 2000 − 300 − 50 = 2650 a inizio del nuovo
  assert.equal(rollBalance(1000, "2026-08-27", "2026-09-27", txs), 2650);
});

test("saldo: anche all'indietro (es. giorno di paga cambiato)", () => {
  assert.equal(rollBalance(2650, "2026-09-27", "2026-08-27", txs), 1000);
});

// ── stima di fine periodo ───────────────────────────────────────────────────
test("fine periodo: a metà mese conta solo quello che deve ancora succedere", () => {
  const p = projectPeriodEnd({ balanceToday: 2300, incomeSoFar: 1800, expensesSoFar: 700, expectedIncome: 1800, expectedExpenses: 1500 });
  assert.equal(p.remainingIncome, 0);   // stipendio già arrivato
  assert.equal(p.remainingExpenses, 800);
  assert.equal(p.endBalance, 1500);     // 2300 − 800, NON 1800 − 1500 = 300
  assert.equal(p.leftToSpend, 800);
});

test("fine periodo: prima dello stipendio lo aggiunge", () => {
  const p = projectPeriodEnd({ balanceToday: 400, incomeSoFar: 0, expensesSoFar: 200, expectedIncome: 1800, expectedExpenses: 1500 });
  assert.equal(p.endBalance, 400 + 1800 - 1300);
});

test("fine periodo: previsioni superate → niente spese 'negative' da togliere", () => {
  const p = projectPeriodEnd({ balanceToday: 100, incomeSoFar: 1800, expensesSoFar: 1700, expectedIncome: 1800, expectedExpenses: 1500 });
  assert.equal(p.remainingExpenses, 0);
  assert.equal(p.endBalance, 100);
  assert.equal(p.leftToSpend, -200);
});

// ── salvadanai e accantonamenti ─────────────────────────────────────────────
test("accantonamenti: i salvadanai degli obiettivi non contano due volte", () => {
  const pots = [{ id: "a", current_balance: 1200 }, { id: "b", current_balance: 450 }, { id: "c", current_balance: 300 }];
  assert.equal(potsForSinkingFunds(pots, ["a", null, "b"]), 300);
  assert.equal(potsForSinkingFunds(pots, []), 1950);
});

test("accantonamenti: se sono collegati a un salvadanaio, conta solo quello", () => {
  // "Emergenza" (a) e "Accantonamenti" (b): gli accantonamenti stanno tutti in b
  const pots = [{ id: "a", current_balance: 572 }, { id: "b", current_balance: 562.8 }];
  assert.equal(potsForSinkingFunds(pots, [], ["b", "b", "b"]), 562.8);
  assert.equal(potsForSinkingFunds(pots, [], [null, "b"]), 562.8);   // basta una voce collegata
  assert.equal(potsForSinkingFunds(pots, [], [null, null]), 1134.8); // nessuna: tutti
});

// ── periodi: ora legale e storico ───────────────────────────────────────────
test("periodo: domenica del cambio d'ora (25/10/2026) → lunedì 26, non resta domenica", () => {
  inZone("Europe/Rome", () => {
    assert.equal(computePeriodRange(25, 2026, 9).from, "2026-10-26");
  });
});

test("periodo: nessun giorno perso quando il periodo finisce sul passaggio all'ora legale", () => {
  inZone("Europe/Rome", () => {
    // 26/02/2029 e 26/03/2029 sono lunedì; il 25/03/2029 si passa all'ora legale
    assert.deepEqual(computePeriodRange(26, 2029, 1), { from: "2029-02-26", to: "2029-03-25" });
  });
});

test("periodi consecutivi: si toccano senza buchi né sovrapposizioni per un anno intero", () => {
  inZone("Europe/Rome", () => {
    for (const payDay of [0, 1, 10, 15, 25, 26, 27, 28]) {
      for (let m = 0; m < 14; m++) {
        const a = computePeriodRange(payDay, 2026, m);
        const b = computePeriodRange(payDay, 2026, m + 1);
        const next = new Date(a.to + "T12:00:00");
        next.setDate(next.getDate() + 1);
        const pad = (n: number) => String(n).padStart(2, "0");
        const nextIso = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
        assert.equal(b.from, nextIso, `giorno ${payDay}, mese ${m}`);
      }
    }
  });
});

test("periodo corrente: il giorno di paga appartiene al nuovo periodo", () => {
  inZone("Europe/Rome", () => {
    // 15/09/2026 è martedì
    assert.deepEqual(getCurrentPeriodAnchor(15, new Date(2026, 8, 15, 9)), { year: 2026, month: 8 });
    assert.deepEqual(getCurrentPeriodAnchor(15, new Date(2026, 8, 14, 23)), { year: 2026, month: 7 });
    assert.equal(currentPeriod(15, new Date(2026, 8, 20)).from, "2026-09-15");
  });
});

test("storico budget: periodi precedenti, il più recente per primo, mese 1-12", () => {
  inZone("Europe/Rome", () => {
    const p = previousPeriods(0, 2026, 0, 2); // ancora gennaio 2026
    assert.deepEqual(p.map(x => [x.year, x.month, x.from]), [[2025, 12, "2025-12-01"], [2025, 11, "2025-11-01"]]);
  });
});

// ── regole di categoria dell'utente ─────────────────────────────────────────
test("regole utente: vincono e la più lunga ha la precedenza", () => {
  const rules = [
    { value: "amazon", category_id: "tech" },
    { value: "amazon prime", category_id: "svago" },
    { value: "bar", category_id: "ristoranti" },
  ];
  assert.equal(matchUserRule("AMAZON PRIME VIDEO 12,99", rules), "svago");
  assert.equal(matchUserRule("Pagamento Amazon.it", rules), "tech");
  assert.equal(matchUserRule("BAR SPORT", rules), "ristoranti");
  assert.equal(matchUserRule("BARILLA SPA", rules), null); // parola corta: solo intera
});

test("parola chiave proposta: il negozio, non il modo di pagamento", () => {
  assert.equal(ruleKeyword("PAGAMENTO POS ESSELUNGA MILANO 12/09 CARTA 1234"), "esselunga");
  assert.equal(ruleKeyword("NETFLIX.COM"), "netflix");
  assert.equal(ruleKeyword("Pagamento Google Pay CONAD CITY"), "conad");
  assert.equal(ruleKeyword("BAR CENTRALE"), "bar centrale");
  assert.equal(ruleKeyword("ADDEBITO SDD ENEL ENERGIA"), "enel");
  assert.equal(ruleKeyword("12/09/2026 1234"), null);
});
