import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryKind, flowOf, moneyTotals, spendingByCategory, isRefund, familyTransferCandidates,
} from "../lib/money";

const tx = (amount: number, category: string | null, description = "", id?: string) =>
  ({ amount, description, category_id: category ? category.toLowerCase() : null, categories: category ? { name: category } : null, id });

test("tipi di categoria", () => {
  assert.equal(categoryKind("Spostamenti"), "transfer");
  assert.equal(categoryKind("Salvadanaio"), "transfer");
  assert.equal(categoryKind("Stipendio"), "income");
  assert.equal(categoryKind("Bonifici"), "income");
  assert.equal(categoryKind("Ristoranti"), "expense");
  assert.equal(categoryKind("Accantonamenti"), "expense");
  assert.equal(categoryKind(null), null);
});

test("rimborso: gli amici che ridanno la cena abbassano la spesa, non sono entrate", () => {
  const txs = [tx(2100, "Stipendio"), tx(-120, "Ristoranti", "CENA"), tx(80, "Ristoranti", "TRASFERIMENTO DENARO BANCOMAT PAY")];
  const t = moneyTotals(txs);
  assert.deepEqual(t, { income: 2100, expenses: 40, saved: 2060 });
  assert.equal(spendingByCategory(txs).get("ristoranti"), 40);
  assert.equal(isRefund(txs[2]), true);
});

test("accantonamenti: conta il versamento; prelievo e pagamento si compensano", () => {
  // tutto l'anno: 20 € al mese nel salvadanaio; a settembre si riprendono 244 € e si paga l'assicurazione
  const settembre = [
    tx(-20, "Accantonamenti", "MOVIMENTO SALVADANAIO"),   // versamento del mese
    tx(244, "Accantonamenti", "MOVIMENTO SALVADANAIO"),   // prelievo per l'assicurazione
    tx(-244, "Assicurazioni", "UNIPOL"),                  // pagamento
  ];
  const t = moneyTotals(settembre);
  assert.equal(t.income, 0);        // il prelievo non è un'entrata
  assert.equal(t.expenses, 20);     // resta solo quello messo da parte
  // stesso risultato se il prelievo ha la categoria della spesa che paga
  assert.equal(moneyTotals([tx(-20, "Accantonamenti"), tx(244, "Assicurazioni"), tx(-244, "Assicurazioni")]).expenses, 20);
});

test("giroconti e movimenti senza categoria", () => {
  assert.deepEqual(flowOf(tx(500, "Spostamenti")), { income: 0, expense: 0 });
  assert.deepEqual(flowOf(tx(50, null)), { income: 50, expense: 0 });
  assert.deepEqual(flowOf(tx(-50, null)), { income: 0, expense: 50 });
  assert.deepEqual(flowOf(tx(-100, "Stipendio")), { income: -100, expense: 0 }); // storno dello stipendio
});

test("il risparmio non cambia: entrate − uscite = somma dei movimenti che non sono giroconti", () => {
  const txs = [tx(2100, "Stipendio"), tx(-800, "Casa"), tx(35, "Casa"), tx(300, "Bonifici"), tx(-400, "Spostamenti"), tx(-60, null), tx(12, null)];
  const t = moneyTotals(txs);
  assert.equal(t.saved, 2100 - 800 + 35 + 300 - 60 + 12);
});

test("soldi tra componenti: trovati per nome e parola da bonifico, non il titolare", () => {
  const members = [{ name: "Marco", is_owner: true }, { name: "Samira", is_owner: false }];
  const txs = [
    tx(270, "Bonifici", "BONIFICO ISTANTANEO DISPOSTO DA GANGEMI SAMIRA", "a"),
    tx(-150, null, "BONIFICO A FAVORE DI GANGEMI SAMIRA", "b"),
    tx(-30, "Ristoranti", "PIZZERIA DA SAMIRA", "c"),                 // un locale, non un bonifico
    tx(100, "Spostamenti", "GIROCONTO DA SAMIRA", "d"),               // già giroconto
    tx(1500, "Stipendio", "BONIFICO DISPOSTO DA ROSSI SPA PER GAROFALO MARCO", "e"), // il titolare no
  ];
  const found = familyTransferCandidates(txs, members);
  assert.equal(found.length, 1);
  assert.equal(found[0].member, "Samira");
  assert.deepEqual(found[0].txs.map(t => t.id), ["a", "b"]);
});
