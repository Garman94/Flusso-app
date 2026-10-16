import { test } from "node:test";
import assert from "node:assert/strict";
import { goalMismatch, goalSaved, potChoicesForGoal, withPotBalances } from "../lib/goals";

const pots = [
  { id: "vacanza", current_balance: 400 },
  { id: "emergenza", current_balance: 1200 },
  { id: "acc", current_balance: 500 },
];
const vacanza = { id: "g1", name: "Vacanza estiva", target_amount: 2000, current_amount: 450, savings_pot_id: "vacanza" };
const laptop = { id: "g2", name: "Nuovo laptop", target_amount: 800, current_amount: 480, savings_pot_id: null };

test("obiettivi: se collegato conta il saldo del salvadanaio, altrimenti il suo contatore", () => {
  assert.equal(goalSaved(vacanza, pots), 400);   // un prelievo dal salvadanaio fa scendere l'obiettivo
  assert.equal(goalSaved(laptop, pots), 480);
  // salvadanaio cancellato: torna il contatore
  assert.equal(goalSaved({ ...vacanza, savings_pot_id: "sparito" }, pots), 450);

  const [v, l] = withPotBalances([vacanza, laptop], pots);
  assert.deepEqual([v.current_amount, v.recorded_amount, v.in_pot], [400, 450, true]);
  assert.deepEqual([l.current_amount, l.recorded_amount, l.in_pot], [480, 480, false]);
  assert.equal(v.name, "Vacanza estiva");
});

test("obiettivi: cifre diverse tra obiettivo e salvadanaio vanno scelte", () => {
  assert.deepEqual(goalMismatch(vacanza, pots), { recorded: 450, inPot: 400 });
  assert.equal(goalMismatch({ ...vacanza, current_amount: 400 }, pots), null);
  assert.equal(goalMismatch(laptop, pots), null);
});

test("obiettivi: non si collega un salvadanaio di un altro obiettivo o degli accantonamenti", () => {
  const choices = potChoicesForGoal(pots, [vacanza, laptop], "g2", ["acc"]);
  assert.deepEqual(choices.map(c => [c.pot.id, c.usedBy, c.sinking]), [
    ["vacanza", "Vacanza estiva", false],
    ["emergenza", null, false],
    ["acc", null, true],
  ]);
  // il proprio salvadanaio resta sceglibile modificando l'obiettivo
  assert.equal(potChoicesForGoal(pots, [vacanza], "g1", [])[0].usedBy, null);
});
