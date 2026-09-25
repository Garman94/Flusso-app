import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateBill, calibrateOtherCosts, forecastConsumption, splitConsumption, parseBillExtraction,
  type Tariff, type Reading,
} from "../lib/utilities";

const luce: Tariff = { supplier: "Enel", unit_price: 0.13, other_unit_costs: 0.06, fixed_monthly: 12, vat_pct: 10, tv_fee_monthly: 9 };
const gas: Tariff = { supplier: "Enel", unit_price: 0.45, other_unit_costs: 0.3, fixed_monthly: 10, vat_pct: 10, tv_fee_monthly: 0 };

test("bolletta luce: energia, altri costi, quote fisse, IVA e canone RAI", () => {
  const b = estimateBill("luce", luce, 200, 9);
  assert.deepEqual(b, { consumption: 200, energy: 26, other: 12, fixed: 12, vat: 5, tv: 9, total: 64 });
});

test("bolletta luce: niente canone RAI a novembre e dicembre", () => {
  assert.equal(estimateBill("luce", luce, 200, 11).tv, 0);
  assert.equal(estimateBill("luce", luce, 400, 10, 2).tv, 9); // ottobre sì, novembre no
});

test("bolletta gas: niente canone, due mesi di quote fisse", () => {
  const b = estimateBill("gas", gas, 100, 1, 2);
  assert.equal(b.tv, 0);
  assert.equal(b.fixed, 20);
  assert.equal(b.total, Math.round((45 + 30 + 20) * 1.1 * 100) / 100);
});

test("taratura: gli altri costi che fanno tornare una bolletta vera", () => {
  // bolletta vera di settembre: 200 kWh, 66,20 € → altri costi = ((66,2 − 9)/1,1 − 12)/200 − 0,13 = 0,07
  const c = calibrateOtherCosts("luce", luce, { total: 66.2, consumption: 200, firstMonth: 9, months: 1 });
  assert.deepEqual(c, { value: 0.07, ok: true });
  // e con quel valore la stima torna
  assert.equal(estimateBill("luce", { ...luce, other_unit_costs: c!.value }, 200, 9).total, 66.2);
  // quote fisse troppo alte: risultato negativo, segnalato
  assert.equal(calibrateOtherCosts("luce", { ...luce, fixed_monthly: 60 }, { total: 66.2, consumption: 200, firstMonth: 9, months: 1 })!.ok, false);
  assert.equal(calibrateOtherCosts("luce", luce, { total: 66.2, consumption: 0, firstMonth: 9, months: 1 }), null);
});

const storia: Reading[] = [
  { year: 2024, month: 9, consumption: 200 },
  { year: 2025, month: 9, consumption: 180 },
  { year: 2025, month: 6, consumption: 200 }, { year: 2025, month: 7, consumption: 250 }, { year: 2025, month: 8, consumption: 250 },
  { year: 2026, month: 6, consumption: 180 }, { year: 2026, month: 7, consumption: 225 }, { year: 2026, month: 8, consumption: 225 },
];

test("previsione: stesso mese degli anni prima, corretto per la tendenza di quest'anno", () => {
  const f = forecastConsumption(storia, 2026, 9)!;
  assert.equal(f.basis, "same-month");
  assert.deepEqual(f.years, [2025, 2024]);
  assert.equal(f.trend, 0.9);                         // giugno-agosto: −10% rispetto al 2025
  assert.equal(f.consumption, Math.round(190 * 0.9)); // media 180 e 200, −10%
});

test("previsione: il dato del mese, se c'è; altrimenti gli ultimi mesi", () => {
  assert.deepEqual(forecastConsumption(storia, 2026, 8), { consumption: 225, basis: "actual", years: [2026], trend: 1 });
  const recenti = forecastConsumption([{ year: 2026, month: 7, consumption: 300 }, { year: 2026, month: 8, consumption: 240 }], 2026, 9)!;
  assert.deepEqual(recenti, { consumption: 270, basis: "recent", years: [], trend: 1 });
  assert.equal(forecastConsumption([], 2026, 9), null);
});

test("previsione: la tendenza non va oltre ±30%", () => {
  const extreme: Reading[] = [
    { year: 2025, month: 9, consumption: 100 },
    { year: 2025, month: 7, consumption: 100 }, { year: 2025, month: 8, consumption: 100 },
    { year: 2026, month: 7, consumption: 300 }, { year: 2026, month: 8, consumption: 300 },
  ];
  assert.equal(forecastConsumption(extreme, 2026, 9)!.trend, 1.3);
});

test("bolletta di due mesi divisa sui mesi, anche a cavallo d'anno", () => {
  assert.deepEqual(splitConsumption(360, 2025, 12, 2), [
    { year: 2025, month: 12, consumption: 180 },
    { year: 2026, month: 1, consumption: 180 },
  ]);
});

test("lettura AI: dati buoni tenuti, valori impossibili scartati", () => {
  const raw = "```json\n" + JSON.stringify([
    {
      tipo: "luce", fornitore: "Enel Energia", prezzo_unitario: 0.132, quota_fissa_mensile: "11,50", iva_percentuale: 10,
      canone_rai_mensile: 9, bolletta: { totale: 98.4, consumo: 360, dal: "2026-07-01", al: "2026-08-31" },
      storico: [{ anno: 2025, mese: 9, consumo: 175 }, { anno: 2025, mese: 13, consumo: 10 }],
    },
    { tipo: "gas", fornitore: "Enel Energia", prezzo_unitario: 45, quota_fissa_mensile: null, iva_percentuale: 22, canone_rai_mensile: 9, bolletta: null, storico: [] },
    { tipo: "acqua", prezzo_unitario: 1 },
  ]) + "\n```";
  const [l, g, ...rest] = parseBillExtraction(raw);
  assert.equal(rest.length, 0);                        // l'acqua non è gestita
  assert.equal(l.kind, "luce");
  assert.equal(l.fixed_monthly, 11.5);
  assert.deepEqual(l.bill, { total: 98.4, consumption: 360, from: "2026-07-01", to: "2026-08-31", months: 2 });
  assert.deepEqual(l.history, [{ year: 2025, month: 9, consumption: 175 }]); // mese 13 scartato
  assert.equal(g.unit_price, null);                    // 45 €/Smc: letto male
  assert.equal(g.tv_fee_monthly, null);                // niente canone sul gas
  assert.equal(g.vat_pct, 22);
  assert.deepEqual(parseBillExtraction("non è JSON"), []);
});

test("bolletta: le righe del calcolo sommano esattamente al totale", () => {
  const b = estimateBill("luce", { ...luce, other_unit_costs: 0.065 }, 185, 9);
  assert.equal(b.total, Math.round((b.energy + b.other + b.fixed + b.vat + b.tv) * 100) / 100);
  assert.equal(b.total, 61.89); // 24,05 + 12,03 + 12 + 4,81 + 9
});
