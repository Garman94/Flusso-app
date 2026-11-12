import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryLabel, isTransferName, topCategories, parseEditAmount, changedFields,
  accountBalanceImpact, beforeAnchor, TRANSFER_LABEL, type EditableTx,
} from "../lib/transaction-edit";

const cats = [
  { id: "ali", name: "Alimentari" },
  { id: "ris", name: "Ristoranti" },
  { id: "tra", name: "Trasporti" },
  { id: "cas", name: "Casa" },
  { id: "bol", name: "Bollette" },
  { id: "sho", name: "Shopping" },
  { id: "sti", name: "Stipendio" },
  { id: "spo", name: "Spostamenti" },
  { id: "pal", name: "Palestra" },
  { id: "via", name: "Viaggi" },
];

test("categoryLabel: Spostamenti si mostra come giroconti, le altre restano", () => {
  assert.equal(categoryLabel("Spostamenti"), TRANSFER_LABEL);
  assert.equal(categoryLabel("spostamenti"), TRANSFER_LABEL);
  assert.equal(categoryLabel("Alimentari"), "Alimentari");
  assert.equal(categoryLabel("Salvadanaio"), "Salvadanaio");
  assert.equal(categoryLabel(null), "");
});

test("isTransferName: Spostamenti e Salvadanaio sono giroconti, Accantonamenti no", () => {
  assert.equal(isTransferName("Spostamenti"), true);
  assert.equal(isTransferName("Salvadanaio"), true);
  assert.equal(isTransferName("Accantonamenti"), false);
  assert.equal(isTransferName(undefined), false);
});

test("topCategories: le più usate tra le uscite, a parità in ordine di nome", () => {
  const txs = [
    { category_id: "ris", amount: -20 }, { category_id: "ris", amount: -15 }, { category_id: "ris", amount: -30 },
    { category_id: "ali", amount: -50 }, { category_id: "ali", amount: -40 },
    { category_id: "via", amount: -300 }, { category_id: "pal", amount: -35 },
    { category_id: "sti", amount: 1500 }, { category_id: "sti", amount: 1500 }, { category_id: "sti", amount: 1500 }, { category_id: "sti", amount: 1500 },
    { category_id: null, amount: -5 },
  ];
  const top = topCategories(txs, cats, { n: 4, sign: -1 }).map(c => c.id);
  // Ristoranti (3), Alimentari (2), poi Palestra e Viaggi (1) in ordine di nome; lo Stipendio entra solo dopo
  assert.deepEqual(top, ["ris", "ali", "pal", "via"]);
});

test("topCategories: tra le entrate prima lo stipendio, poi si riempie con le altre usate", () => {
  const txs = [
    { category_id: "sti", amount: 1500 },
    { category_id: "ris", amount: -20 }, { category_id: "ris", amount: -20 },
  ];
  const top = topCategories(txs, cats, { n: 3, sign: 1 }).map(c => c.id);
  assert.deepEqual(top.slice(0, 2), ["sti", "ris"]);
  assert.equal(top.length, 3);
});

test("topCategories: senza movimenti propone le scelte più comuni che esistono", () => {
  assert.deepEqual(topCategories([], cats, { sign: -1 }).map(c => c.id), ["ali", "ris", "tra", "cas", "bol", "sho"]);
  assert.deepEqual(topCategories([], cats, { sign: 1, n: 2 }).map(c => c.id), ["sti", "spo"]);
});

test("topCategories: ignora categorie che non ci sono più e non ripete", () => {
  const txs = [{ category_id: "sparita", amount: -10 }, { category_id: "ali", amount: -10 }];
  const top = topCategories(txs, cats, { sign: -1 }).map(c => c.id);
  assert.equal(top[0], "ali");
  assert.equal(new Set(top).size, top.length);
  assert.ok(!top.includes("sparita"));
});

test("parseEditAmount: virgola, migliaia, euro; sempre positivo; zero e testo non valgono", () => {
  assert.equal(parseEditAmount("12,50"), 12.5);
  assert.equal(parseEditAmount("1.234,56"), 1234.56);
  assert.equal(parseEditAmount("€ 8"), 8);
  assert.equal(parseEditAmount("-7,3"), 7.3);
  assert.equal(parseEditAmount("10.005"), 10005);
  assert.equal(parseEditAmount("0"), null);
  assert.equal(parseEditAmount(""), null);
  assert.equal(parseEditAmount("abc"), null);
});

const base: EditableTx = {
  category_id: "ali", amount: -42.1, date: "2026-11-03", description: "SUPERMERCATO",
  member_id: null, account_id: "c1", notes: null,
};

test("changedFields: solo i campi cambiati davvero", () => {
  assert.deepEqual(changedFields(base, { ...base }), []);
  assert.deepEqual(changedFields(base, { ...base, category_id: "ris", notes: "cena" }), ["category_id", "notes"]);
  assert.deepEqual(changedFields(base, { ...base, amount: 42.1 }), ["amount"]);
});

test("changedFields: spazi, stringa vuota e centesimi non sono cambi", () => {
  assert.deepEqual(changedFields(base, { ...base, description: "  SUPERMERCATO ", notes: "" }), []);
  assert.deepEqual(changedFields({ ...base, amount: -42.1 }, { ...base, amount: -42.100000001 }), []);
  assert.deepEqual(changedFields(base, { ...base, member_id: "p1", account_id: null, date: "2026-11-04" }), ["date", "member_id", "account_id"]);
});

const accounts = [
  { id: "c1", name: "Conto A", anchor_date: "2026-11-01" },
  { id: "c2", name: "Conto B", anchor_date: "2026-11-05" },
];
const today = "2026-11-10";

test("accountBalanceImpact: cambia l'importo di un movimento dopo l'ancora", () => {
  const before = { amount: -42.1, date: "2026-11-03", account_id: "c1" };
  assert.deepEqual(accountBalanceImpact(before, { ...before, amount: -40 }, accounts, today), [
    { accountId: "c1", name: "Conto A", delta: 2.1 },
  ]);
});

test("accountBalanceImpact: spostato su un altro conto, uno scende e l'altro sale", () => {
  const before = { amount: -30, date: "2026-11-07", account_id: "c1" };
  assert.deepEqual(accountBalanceImpact(before, { ...before, account_id: "c2" }, accounts, today), [
    { accountId: "c1", name: "Conto A", delta: 30 },
    { accountId: "c2", name: "Conto B", delta: -30 },
  ]);
});

test("accountBalanceImpact: fino al giorno dell'ancora il saldo non cambia", () => {
  const before = { amount: -30, date: "2026-11-05", account_id: "c2" };
  assert.deepEqual(accountBalanceImpact(before, { ...before, amount: -10 }, accounts, today), []);
  assert.deepEqual(beforeAnchor(before, { ...before, amount: -10 }, accounts)?.id, "c2");
});

test("accountBalanceImpact: spostare la data prima dell'ancora toglie il movimento dal saldo", () => {
  const before = { amount: -30, date: "2026-11-06", account_id: "c2" };
  const after = { ...before, date: "2026-11-04" };
  assert.deepEqual(accountBalanceImpact(before, after, accounts, today), [{ accountId: "c2", name: "Conto B", delta: 30 }]);
  assert.equal(beforeAnchor(before, after, accounts)?.id, "c2");
});

test("accountBalanceImpact: i movimenti nel futuro e quelli senza conto non toccano il saldo di oggi", () => {
  const future = { amount: -30, date: "2026-11-20", account_id: "c1" };
  assert.deepEqual(accountBalanceImpact(future, { ...future, amount: -50 }, accounts, today), []);
  const none = { amount: -30, date: "2026-11-07", account_id: null };
  assert.deepEqual(accountBalanceImpact(none, { ...none, amount: -50 }, accounts, today), []);
});

test("beforeAnchor: niente avviso se non cambiano importo, data o conto, o se è dopo l'ancora", () => {
  const t = { amount: -30, date: "2026-11-05", account_id: "c2" };
  assert.equal(beforeAnchor(t, { ...t }, accounts), null);
  const after = { amount: -30, date: "2026-11-07", account_id: "c2" };
  assert.equal(beforeAnchor(after, { ...after, amount: -20 }, accounts), null);
});
