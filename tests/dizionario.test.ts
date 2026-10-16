import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { categorize, matchDictionary, type DictionaryEntry } from "../lib/categorize";

// Il dizionario di partenza letto dalla migration, così il test controlla proprio quello che va nel database.
const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/044_dizionario_negozi.sql"), "utf8");
const seed: DictionaryEntry[] = [...sql.matchAll(/\('([^']+)', '([^']+)', 'base'\)/g)]
  .map(m => ({ keyword: m[1], category_name: m[2] }));

const categories = ["Alimentari", "Ristoranti", "Bollette", "Trasporti", "Shopping", "Abbigliamento", "Tecnologia", "Istruzione", "Salute", "Spesa casa"]
  .map(name => ({ id: name.toLowerCase().replace(" ", "-"), name }));

test("dizionario: letto dalla migration, parole tutte normalizzate", () => {
  assert.ok(seed.length > 250);
  for (const e of seed) assert.match(e.keyword, /^[a-z0-9 ]+$/, e.keyword);
});

test("dizionario: gli esempi di Marco", () => {
  const cases: [string, string][] = [
    ["ADDEBITO SDD ENEL ENERGIA SPA", "Bollette"],
    ["NEN SPA FORNITURA LUCE", "Bollette"],
    ["OCTOPUS ENERGY ITALIA", "Bollette"],
    ["PAGAMENTO POS MD SPA 1234", "Alimentari"],
    ["IPERAL SPA SONDRIO", "Alimentari"],
    ["SUSHI X MILANO", "Ristoranti"],
    ["PARRUCCHIERE ANNA", "Salute"],
    ["MECCANICO ROSSI SNC", "Trasporti"],
    ["PANETTERIA DEL CORSO", "Alimentari"],
    ["SERRAVALLE DESIGNER OUTLET", "Shopping"],
  ];
  for (const [desc, cat] of cases) {
    assert.equal(categories.find(c => c.id === categorize({ description: desc }, { userRules: [], dictionary: seed, categories }))?.name, cat, desc);
  }
});

test("dizionario: niente parole che scattano dentro altre parole", () => {
  for (const desc of [
    "COMMISSIONE TRANSACTION FEE",
    "COSTI AGGIUNTIVI SPEDIZIONE",
    "PROMOTION CODE",
    "CONSEGNA NORMALE",
    "MARKETING SERVICES",
  ]) {
    assert.equal(matchDictionary(desc, seed), null, desc);
  }
  // il gasolio va nei trasporti, non nell'abbigliamento (Diesel)
  assert.equal(categorize({ description: "Q8 GASOLIO DIESEL" }, { userRules: [], dictionary: seed, categories }), "trasporti");
});

test("priorità: la regola personale vince sul dizionario, il dizionario sulle parole del codice", () => {
  const ctx = { dictionary: seed, categories };
  // il codice dice Tecnologia per "amazon", il dizionario Shopping
  assert.equal(categorize({ description: "AMAZON EU SARL" }, { ...ctx, userRules: [] }), "shopping");
  // la regola personale porta la spesa su una categoria tutta sua
  assert.equal(categorize({ description: "ESSELUNGA SPA" }, { ...ctx, userRules: [{ value: "esselunga", category_id: "spesa-casa" }] }), "spesa-casa");
  // una regola verso una categoria che non c'è più non conta
  assert.equal(categorize({ description: "ESSELUNGA SPA" }, { ...ctx, userRules: [{ value: "esselunga", category_id: "sparita" }] }), "alimentari");
  // senza nulla di riconoscibile: nessuna categoria
  assert.equal(categorize({ description: "BONIFICO A MARIO ROSSI" }, { ...ctx, userRules: [] }), null);
});

test("priorità: la categoria della banca arriva dopo il dizionario", () => {
  const ctx = { userRules: [], dictionary: seed, categories };
  assert.equal(categorize({ description: "ENEL ENERGIA", bankCategory: "Casa varie" }, ctx), "bollette");
  assert.equal(categorize({ description: "NEGOZIO SCONOSCIUTO", bankCategory: "Ristoranti e bar" }, ctx), "ristoranti");
});

test("proposte: almeno due persone, solo categorie di spesa predefinite, non già note", async () => {
  const { dictionaryProposals } = await import("../lib/dictionary-proposals");
  const sys = (name: string) => ({ name, user_id: null });
  const rules = [
    { user_id: "u1", value: "Forneria Luigi", categories: sys("Alimentari") },
    { user_id: "u2", value: "forneria luigi", categories: sys("Alimentari") },
    { user_id: "u2", value: "forneria luigi", categories: sys("Alimentari") },
    { user_id: "u1", value: "Pasticceria Rossi", categories: sys("Ristoranti") },  // "pasticceria" la conosce già il codice
    { user_id: "u2", value: "pasticceria rossi", categories: sys("Ristoranti") },  // stessa persona: conta una volta
    { user_id: "u3", value: "Gelateria Bianchi", categories: sys("Ristoranti") },  // una sola persona
    { user_id: "u1", value: "samira", categories: sys("Spostamenti") },            // giroconto: mai
    { user_id: "u2", value: "samira", categories: sys("Spostamenti") },
    { user_id: "u1", value: "palestra zen", categories: { name: "Sport", user_id: "u1" } }, // categoria personale
    { user_id: "u2", value: "palestra zen", categories: { name: "Sport", user_id: "u2" } },
    { user_id: "u1", value: "iperal", categories: sys("Alimentari") },             // già nel dizionario
    { user_id: "u2", value: "iperal", categories: sys("Alimentari") },
    { user_id: "u1", value: "esselunga", categories: sys("Alimentari") },          // già nelle parole del codice
    { user_id: "u2", value: "esselunga", categories: sys("Alimentari") },
    { user_id: "u1", value: "amazon", categories: sys("Tecnologia") },             // il codice dice Tecnologia...
    { user_id: "u3", value: "amazon", categories: sys("Tecnologia") },             // ...ma il dizionario Shopping: già noto
  ];
  assert.deepEqual(dictionaryProposals(rules, seed), [{ keyword: "forneria luigi", category_name: "Alimentari", users: 2 }]);
});
