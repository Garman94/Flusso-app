import { test } from "node:test";
import assert from "node:assert/strict";
import { founderSeatsInfo, FOUNDER_SEATS_SHOW_BELOW } from "../lib/founder-seats";
import { FOUNDER_SEATS } from "../lib/config";

test("i posti sono 50", () => {
  assert.equal(FOUNDER_SEATS, 50);
});

test("senza conteggio: solo la frase generica, mai un numero inventato", () => {
  for (const taken of [null, Number.NaN, -3]) {
    const s = founderSeatsInfo(taken);
    assert.equal(s.left, null);
    assert.equal(s.soldOut, false);
    assert.equal(s.note, "Solo per i primi 50");
  }
});

test("finché ne restano almeno 10 il numero non si vede", () => {
  for (const taken of [0, 1, 25, 40]) {
    const s = founderSeatsInfo(taken);
    assert.equal(s.note, "Solo per i primi 50");
    assert.equal(s.left, 50 - taken);
  }
});

test("sotto i 10 si mostrano i posti rimasti", () => {
  assert.equal(FOUNDER_SEATS_SHOW_BELOW, 10);
  assert.equal(founderSeatsInfo(41).note, "Restano 9 posti su 50");
  assert.equal(founderSeatsInfo(48).note, "Restano 2 posti su 50");
  assert.equal(founderSeatsInfo(49).note, "Resta 1 posto su 50");
});

test("finiti i posti: esaurito, anche se per errore ce ne sono di più", () => {
  for (const taken of [50, 63]) {
    const s = founderSeatsInfo(taken);
    assert.equal(s.left, 0);
    assert.equal(s.soldOut, true);
    assert.equal(s.note, "Posti esauriti");
  }
});

test("il totale si può cambiare", () => {
  assert.equal(founderSeatsInfo(0, 100).note, "Solo per i primi 100");
  assert.equal(founderSeatsInfo(95, 100).note, "Restano 5 posti su 100");
});
