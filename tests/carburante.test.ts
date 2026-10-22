import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completeRefuel, fullToFull, fuelSummary, refuelDistances, sortRefuels, routineKm, routineKmOnDay,
  weekdayISO, dailyKm, monthlyComparison, isFuelPurchase, type Refuel, type Routine,
} from "../lib/fuel";

const r = (p: Partial<Refuel> & { id: string; date: string }): Refuel => ({
  amount: 0, quantity: 0, price: 0, odometer_km: null, trip_km: null, full_tank: true, ...p,
});

test("completeRefuel: euro e prezzo → litri (il pieno di Marco del 22/10)", () => {
  const c = completeRefuel({ amount: 35.65, price: 2.26 })!;
  assert.equal(c.amount, 35.65);
  assert.equal(c.quantity, 15.774);
  assert.equal(c.price, 2.26);
});

test("completeRefuel: euro e litri → prezzo; litri e prezzo → euro; un solo valore → null", () => {
  assert.equal(completeRefuel({ amount: 50, quantity: 25 })!.price, 2);
  assert.equal(completeRefuel({ quantity: 20, price: 1.799 })!.amount, 35.98);
  assert.equal(completeRefuel({ amount: 50 }), null);
  assert.equal(completeRefuel({ amount: 0, price: 2 }), null);
});

test("un pieno con i km dall'ultimo pieno basta per il consumo (caso Marco: 285 km, 35,65 € a 2,26)", () => {
  const c = completeRefuel({ amount: 35.65, price: 2.26 })!;
  const w = fullToFull([r({ id: "a", date: "2026-10-22", ...c, trip_km: 285 })]);
  assert.equal(w.length, 1);
  assert.equal(Math.round(w[0].kmPerUnit * 10) / 10, 18.1);
  assert.equal(Math.round(w[0].per100 * 10) / 10, 5.5);
  assert.equal(Math.round(w[0].costPerKm * 1000) / 1000, 0.125);
});

test("da pieno a pieno: un rifornimento parziale entra nel tratto successivo", () => {
  const refuels = [
    r({ id: "1", date: "2026-09-01", amount: 60, quantity: 30, price: 2, odometer_km: 10000 }),
    r({ id: "2", date: "2026-09-10", amount: 20, quantity: 10, price: 2, odometer_km: 10300, full_tank: false }),
    r({ id: "3", date: "2026-09-20", amount: 40, quantity: 20, price: 2, odometer_km: 10600 }),
  ];
  const w = fullToFull(refuels);
  // il primo pieno non ha km noti prima: il tratto valido è dal pieno 1 al pieno 3, 600 km con 30 l
  assert.equal(w.length, 1);
  assert.equal(w[0].from, "2026-09-01");
  assert.equal(w[0].km, 600);
  assert.equal(w[0].quantity, 30);
  assert.equal(w[0].kmPerUnit, 20);
  assert.equal(w[0].costPerKm, 0.1);
});

test("km dal contachilometri o scritti a mano, ordinati per data", () => {
  const sorted = sortRefuels([
    r({ id: "b", date: "2026-09-20", odometer_km: 10600 }),
    r({ id: "a", date: "2026-09-01", odometer_km: 10000 }),
    r({ id: "c", date: "2026-09-30", trip_km: 250 }),
  ]);
  assert.deepEqual(sorted.map(x => x.id), ["a", "b", "c"]);
  assert.deepEqual(refuelDistances(sorted), [null, 600, 250]);
});

test("fuelSummary: senza tratti da pieno a pieno c'è solo il costo al km", () => {
  const s = fuelSummary([r({ id: "1", date: "2026-10-01", amount: 30, quantity: 15, price: 2, trip_km: 300, full_tank: false })]);
  assert.equal(s.kmPerUnit, null);
  assert.equal(s.costPerKm, 0.1);
  assert.equal(s.windows, 0);
});

const lavoro: Routine = { id: "lav", name: "Lavoro", km: 15, round_trip: true, kind: "days", weekdays: [1, 2, 3, 4, 5], times_per_week: null, start_date: null, end_date: null };
const sera: Routine = { id: "sera", name: "Impegno serale", km: 7, round_trip: true, kind: "weekly", weekdays: [], times_per_week: 2, start_date: null, end_date: null };

test("giorni della settimana: 1 = lunedì, 7 = domenica", () => {
  assert.equal(weekdayISO("2026-10-19"), 1); // lunedì
  assert.equal(weekdayISO("2026-10-25"), 7); // domenica
});

test("tragitti abituali: giorni fissi e N volte a settimana", () => {
  assert.equal(routineKmOnDay(lavoro, "2026-10-19"), 30);
  assert.equal(routineKmOnDay(lavoro, "2026-10-25"), 0);
  // una settimana intera (lun-dom): lavoro 5 × 30 = 150, sera 2 × 14 = 28
  const week = routineKm([lavoro, sera], [], "2026-10-19", "2026-10-25");
  assert.equal(week.byRoutine.lav, 150);
  assert.equal(Math.round(week.byRoutine.sera), 28);
  assert.equal(Math.round(week.total), 178);
});

test("le pause (ferie) tolgono i km abituali", () => {
  const week = routineKm([lavoro], [{ from_date: "2026-10-21", to_date: "2026-10-23" }], "2026-10-19", "2026-10-25");
  assert.equal(week.total, 60);
});

test("km fatti spalmati tra due rifornimenti e confronto mese per mese con gli abituali", () => {
  const refuels = [
    r({ id: "1", date: "2026-10-04", amount: 50, quantity: 25, price: 2, odometer_km: 20000 }), // domenica
    r({ id: "2", date: "2026-10-11", amount: 50, quantity: 25, price: 2, odometer_km: 20300 }), // domenica dopo: 7 giorni
  ];
  const days = dailyKm(refuels);
  assert.equal(days.size, 7);
  assert.equal(Math.round([...days.values()].reduce((s, k) => s + k, 0)), 300);
  const [ott] = monthlyComparison(refuels, [lavoro, sera], []);
  assert.equal(ott.month, "2026-10");
  assert.equal(ott.coveredDays, 7);
  assert.equal(ott.km, 300);
  assert.equal(Math.round(ott.routineKm), 178);
  assert.equal(Math.round(ott.extraKm), 122);
});

test("rifornimenti riconosciuti nei movimenti, senza falsi positivi", () => {
  for (const d of ["PAGAMENTO POS ENI STATION 1234", "Q8 EASY MILANO", "IP MATIC VIA ROMA", "TAMOIL SELF", "Rifornimento carburante"]) {
    assert.ok(isFuelPurchase(d), d);
  }
  for (const d of ["ESSELUNGA MILANO", "SIPARIO TEATRO", "CORSO PER CAPIRE LE API", "PANETTERIA ENIGMA"]) {
    assert.ok(!isFuelPurchase(d), d);
  }
});
