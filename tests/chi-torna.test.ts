import { test } from "node:test";
import assert from "node:assert/strict";
import {
  userReturns, returnSummary, weeklyActive, activeInLastDays, mondayOf, weekLabel, romeShortDay, RETURN_DAYS, RETURN_TARGET,
} from "../lib/retention";

const now = new Date("2026-11-16T10:00:00Z"); // lunedì
const since = "2026-09-20T08:00:00Z";          // prima visita registrata

test("le regole: 7 giorni, obiettivo 40%", () => {
  assert.equal(RETURN_DAYS, 7);
  assert.equal(RETURN_TARGET, 0.4);
});

test("tornato solo se apre Flusso almeno 7 giorni dopo l'iscrizione", () => {
  const users = [
    { id: "a", name: "Anna", createdAt: "2026-10-01T09:00:00Z" },
    { id: "b", name: "Bruno", createdAt: "2026-10-01T09:00:00Z" },
    { id: "c", name: null, createdAt: "2026-10-01T09:00:00Z" },
  ];
  const visits = [
    { userId: "a", at: "2026-10-01T09:05:00Z" },
    { userId: "a", at: "2026-10-08T09:00:00Z" }, // esattamente 7 giorni dopo: conta
    { userId: "b", at: "2026-10-01T09:05:00Z" },
    { userId: "b", at: "2026-10-08T08:59:00Z" }, // un minuto prima dei 7 giorni: non conta
    // c non ha mai aperto l'app
  ];
  const rows = userReturns(users, visits, now, since);
  const st = Object.fromEntries(rows.map(r => [r.id, r.status]));
  assert.deepEqual(st, { a: "returned", b: "not_returned", c: "not_returned" });
  assert.equal(rows.find(r => r.id === "a")!.lastVisit, "2026-10-08T09:00:00.000Z");
  assert.equal(rows.find(r => r.id === "c")!.lastVisit, null);

  const s = returnSummary(rows);
  assert.equal(s.eligible, 3);
  assert.equal(s.returned, 1);
  assert.ok(Math.abs(s.rate! - 1 / 3) < 1e-9);
});

test("chi si è iscritto da meno di 7 giorni non si conta ancora", () => {
  const users = [{ id: "n", name: "Nuovo", createdAt: "2026-11-12T10:00:00Z" }];
  const rows = userReturns(users, [{ userId: "n", at: "2026-11-15T10:00:00Z" }], now, since);
  assert.equal(rows[0].status, "too_early");
  const s = returnSummary(rows);
  assert.equal(s.eligible, 0);
  assert.equal(s.rate, null);
  assert.equal(s.tooEarly, 1);
});

test("prima che Flusso contasse le visite: fuori dal conto, anche se è tornato dopo", () => {
  const users = [
    { id: "v", name: "Vecchio", createdAt: "2026-09-01T10:00:00Z" }, // settimana finita prima del 20/9
    { id: "w", name: "A cavallo", createdAt: "2026-09-15T10:00:00Z" }, // 22/9: la sua settimana è dopo
  ];
  const visits = [
    { userId: "v", at: "2026-10-10T10:00:00Z" },
    { userId: "w", at: "2026-09-25T10:00:00Z" },
  ];
  const rows = userReturns(users, visits, now, since);
  const st = Object.fromEntries(rows.map(r => [r.id, r.status]));
  assert.deepEqual(st, { v: "before_tracking", w: "returned" });
  const s = returnSummary(rows);
  assert.equal(s.beforeTracking, 1);
  assert.equal(s.eligible, 1);
  // senza nessuna visita registrata non si può contare nessuno
  assert.equal(userReturns(users, [], now, null).every(r => r.status === "before_tracking"), true);
});

test("ordine: iscritti più recenti in alto", () => {
  const users = [
    { id: "x", name: null, createdAt: "2026-10-01T10:00:00Z" },
    { id: "y", name: null, createdAt: "2026-11-01T10:00:00Z" },
  ];
  assert.deepEqual(userReturns(users, [], now, since).map(r => r.id), ["y", "x"]);
});

test("settimane da lunedì, col calendario di Roma", () => {
  assert.equal(mondayOf(new Date("2026-11-16T10:00:00Z")), "2026-11-16");
  assert.equal(mondayOf(new Date("2026-11-22T20:00:00Z")), "2026-11-16"); // domenica sera
  // domenica 22/11 alle 23:30 UTC a Roma è già lunedì 23
  assert.equal(mondayOf(new Date("2026-11-22T23:30:00Z")), "2026-11-23");
  // cambio dell'ora: domenica 25/10/2026
  assert.equal(mondayOf(new Date("2026-10-25T12:00:00Z")), "2026-10-19");
  assert.equal(mondayOf(new Date("2026-10-26T00:30:00Z")), "2026-10-26");
});

test("attivi a settimana: persone diverse, admin e demo non contano, nuovi iscritti", () => {
  const users = [
    { id: "a", name: null, createdAt: "2026-11-02T10:00:00Z" },
    { id: "b", name: null, createdAt: "2026-11-10T10:00:00Z" },
  ];
  const visits = [
    { userId: "a", at: "2026-11-03T10:00:00Z" },
    { userId: "a", at: "2026-11-04T10:00:00Z" },       // stessa persona, stessa settimana: una
    { userId: "a", at: "2026-11-11T10:00:00Z" },
    { userId: "b", at: "2026-11-11T10:00:00Z" },
    { userId: "b", at: "2026-11-16T09:00:00Z" },
    { userId: "admin", at: "2026-11-16T09:00:00Z" },   // non è tra gli utenti passati
  ];
  const weeks = weeklyActive(users, visits, now, 3);
  assert.deepEqual(weeks, [
    { start: "2026-11-02", active: 1, newUsers: 1 },
    { start: "2026-11-09", active: 2, newUsers: 1 },
    { start: "2026-11-16", active: 1, newUsers: 0 },
  ]);
  assert.equal(weeklyActive(users, visits, now).length, 8);
});

test("etichette", () => {
  assert.equal(weekLabel("2026-11-16", now), "Questa settimana");
  assert.equal(weekLabel("2026-11-09", now), "Dal 9 nov");
  assert.equal(romeShortDay("2026-09-19T23:30:00Z"), "20 set");
});

test("attivi negli ultimi 7 giorni e nei 7 prima", () => {
  const users = [
    { id: "a", name: null, createdAt: "2026-10-01T10:00:00Z" },
    { id: "b", name: null, createdAt: "2026-10-01T10:00:00Z" },
  ];
  const visits = [
    { userId: "a", at: "2026-11-15T22:00:00Z" },     // ieri
    { userId: "a", at: "2026-11-14T10:00:00Z" },     // stessa persona: una
    { userId: "b", at: "2026-11-09T10:00:01Z" },     // 7 giorni meno un secondo fa: dentro
    { userId: "b", at: "2026-11-09T09:00:00Z" },     // poco più di 7 giorni fa: settimana prima
    { userId: "a", at: "2026-11-01T10:00:00Z" },     // più di 14 giorni fa: fuori
    { userId: "admin", at: "2026-11-16T09:00:00Z" }, // non tra gli utenti
  ];
  assert.deepEqual(activeInLastDays(users, visits, now), { current: 2, previous: 1 });
});
