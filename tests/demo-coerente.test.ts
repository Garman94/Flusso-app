import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Migration 051: la demo costruita sui periodi di paga. I numeri (entrate, risparmio, conto, auto)
// sono stati provati sul database in una transazione annullata; qui si controlla che il testo della
// migration non torni indietro sui problemi trovati il 10/11/2026.
const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/051_demo_coerente.sql"), "utf8");
const down = fs.readFileSync(path.join(__dirname, "../supabase/rollback/051_demo_coerente_down.sql"), "utf8");

// Solo il codice, senza i commenti (che raccontano anche com'era prima).
const code = sql
  .split(/\r?\n/) // anche con i fine riga di Windows (CRLF)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

test("la demo usa nomi di fantasia, non quelli delle versioni precedenti", () => {
  assert.doesNotMatch(code, /samira/i);
  assert.doesNotMatch(code, /marco/i);
  assert.match(code, /full_name = 'Giulia'/);
  assert.match(code, /'Giulia', '#[0-9a-f]{6}', true/i, "Giulia è la titolare (is_owner)");
  assert.match(code, /'Luca'/);
});

test("nessun movimento dopo oggi", () => {
  assert.match(code, /v\.dt <= current_date/);
});

test("un solo obiettivo per la vacanza e il fondo emergenze resta un salvadanaio", () => {
  assert.doesNotMatch(code, /Vacanza 2026/);
  assert.doesNotMatch(code, /'Fondo emergenza'/);
  assert.match(code, /'Vacanza estiva'/);
  assert.match(code, /'Emergenza'/);
});

test("conto, auto e accantonamenti nel loro salvadanaio", () => {
  assert.match(code, /insert into public\.accounts|insert into accounts/i);
  assert.match(code, /'Conto in comune'/);
  assert.match(code, /insert into (public\.)?vehicles/i);
  assert.match(code, /insert into (public\.)?vehicle_refuels/i);
  assert.match(code, /insert into (public\.)?vehicle_routines/i);
  assert.match(code, /'Accantonamenti'/);
});

test("prezzo del carburante con tre decimali, come al distributore", () => {
  assert.match(code, /round\(1\.82 \+/);
});

test("reseed_demo_salvadanai resta (la chiama /api/demo/reset) e la demo si ricarica", () => {
  assert.match(code, /create or replace function public\.reseed_demo\(\)/);
  assert.match(code, /create or replace function public\.reseed_demo_salvadanai\(\)/);
  assert.match(code, /select public\.reseed_demo\(\);/);
  assert.match(code, /revoke all on function public\.reseed_demo_salvadanai\(\)/);
});

test("il rollback rimette entrambe le funzioni", () => {
  assert.match(down, /create or replace function public\.reseed_demo\(\)/i);
  assert.match(down, /create or replace function public\.reseed_demo_salvadanai\(\)/i);
});
