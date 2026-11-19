import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRecap, type RecapTx } from "../lib/recap";
import type { PlanItem } from "../lib/fixed-expenses";
import {
  monthlyEmail, monthlyHighlights, monthlyStarted, monthlyStartLabel, periodToRecap, lastClosedPeriod,
  recapReadiness, MONTHLY_FIRST_DAY, type MonthlyEmailLinks,
} from "../lib/monthly-email";
import { runMonthlyEmails } from "../lib/monthly-email-server";

const cat = (name: string) => ({ name, icon: "•", color: "#000" });
const tx = (date: string, amount: number, category: string, description = category): RecapTx =>
  ({ date, amount, description, category_id: category.toLowerCase(), categories: cat(category) });

// periodi di paga del 27 (come tests/riepilogo.test.ts)
const AGO = { from: "2026-07-27", to: "2026-08-26" };
const LUG = { from: "2026-06-27", to: "2026-07-26" };
const GIU = { from: "2026-05-27", to: "2026-06-26" };
const MAG = { from: "2026-04-27", to: "2026-05-26" };
const APR = { from: "2026-03-27", to: "2026-04-26" };

const txs: RecapTx[] = [
  tx("2026-07-27", 2100, "Stipendio"),
  tx("2026-08-02", -800, "Casa", "Affitto"),
  tx("2026-08-05", -90, "Alimentari", "Esselunga"),
  tx("2026-08-16", -60, "Alimentari", "Esselunga"),
  tx("2026-08-16", -82, "Ristoranti", "Cena"),
  tx("2026-08-10", -13.99, "Intrattenimento", "Netflix"),
  tx("2026-08-25", -300, "Spostamenti", "Giroconto"),
  tx("2026-06-27", 2100, "Stipendio"),
  tx("2026-07-02", -800, "Casa", "Affitto"),
  tx("2026-07-06", -120, "Alimentari", "Esselunga"),
  tx("2026-07-18", -40, "Ristoranti", "Pizza"),
  tx("2026-07-10", -13.99, "Intrattenimento", "Netflix"),
  tx("2026-05-27", 2100, "Stipendio"),
  tx("2026-06-02", -800, "Casa", "Affitto"),
  tx("2026-06-08", -100, "Alimentari", "Esselunga"),
  tx("2026-06-15", -30, "Ristoranti", "Bar"),
  tx("2026-05-05", -180, "Alimentari", "Esselunga"),
  tx("2026-05-20", -20, "Ristoranti", "Bar"),
];

function plan(p: Partial<PlanItem>): PlanItem {
  return {
    id: "x", name: "Voce", tipologia: "fissa", frequency: "mensile", custom_days: null,
    amount: 10, amount_max: null, due_day: null, due_month: null, match_keywords: [],
    secondary_name: null, end_date: null, last_paid_date: null, debt_type: null,
    next_due_date: null, category_id: null, ...p,
  };
}
const fixed = [
  plan({ name: "Affitto", amount: 800, due_day: 2, match_keywords: ["affitto"] }),
  plan({ name: "Netflix", amount: 13.99, due_day: 10, match_keywords: ["netflix"] }),
  plan({ name: "Spotify", amount: 10.99, due_day: 11, match_keywords: ["spotify"] }),
];

/** gli importi hanno uno spazio non separabile prima di "€": nei test basta uno spazio normale */
const sp = (s: string) => s.replace(/ /g, " ");

const links: MonthlyEmailLinks = {
  recap: "https://x.it/dashboard/riepilogo?da=email-mese",
  plan: "https://x.it/dashboard/smart?da=email-mese",
  settings: "https://x.it/dashboard/account?da=email-mese#avvisi",
  unsubscribe: "https://x.it/disiscriviti?u=1&k=monthly&t=abc",
};

test("quando parte: nei primi 10 giorni del periodo nuovo, per il periodo appena chiuso", () => {
  // stipendio il 27: il 27/8 (giovedì) comincia il periodo nuovo
  assert.deepEqual({ from: periodToRecap(27, "2026-08-27")?.from, to: periodToRecap(27, "2026-08-27")?.to }, AGO);
  assert.equal(periodToRecap(27, "2026-09-05")?.from, AGO.from); // nono giorno
  assert.equal(periodToRecap(27, "2026-09-06"), null);            // decimo giorno passato
  assert.equal(periodToRecap(27, "2026-08-26"), null);            // ultimo giorno del periodo: lontano dall'inizio
  // mese solare: dal 1 al 10
  assert.equal(periodToRecap(0, "2026-12-01")?.from, "2026-11-01");
  assert.equal(periodToRecap(0, "2026-12-10")?.to, "2026-11-30");
  assert.equal(periodToRecap(0, "2026-12-11"), null);
  // l'ultimo periodo chiuso, a qualsiasi giorno (Admin → Vedila)
  // (il 27/6 era sabato: quel periodo comincia venerdì 26)
  assert.equal(lastClosedPeriod(27, "2026-08-20").to, LUG.to);
});

test("parte solo con il mese completo: niente risparmi falsi con l'estratto conto a metà", () => {
  assert.equal(recapReadiness(buildRecap(txs, AGO, [LUG, GIU, MAG, APR])), "ok");
  assert.equal(recapReadiness(buildRecap(txs, LUG, [GIU, MAG, APR])), "incomplete");  // ultimo il 18, fine il 26
  const late = [tx("2026-05-05", -180, "Alimentari"), tx("2026-05-12", -20, "Bar"), tx("2026-05-24", -30, "Bar")];
  assert.equal(recapReadiness(buildRecap(late, MAG, [APR])), "starts-late");          // primo il 5, inizio il 27/4
  const few = [tx("2026-08-02", -800, "Casa"), tx("2026-08-25", -10, "Bar")];
  assert.equal(recapReadiness(buildRecap(few, AGO, [LUG])), "few");
});

test("contenuto: quanto hai risparmiato, confronto, mai importi nell'oggetto", () => {
  const r = buildRecap(txs, AGO, [LUG, GIU, MAG, APR]);
  const raw = monthlyEmail({ name: "Giulia Rossi", payDay: 27, recap: r }, links);
  const e = { ...raw, html: sp(raw.html), text: sp(raw.text) };
  assert.equal(e.variant, "saved");
  assert.equal(e.subject, "Com'è andato agosto");
  assert.doesNotMatch(e.subject + e.preheader, /\d+,\d{2}|€/);
  assert.match(e.html, /Ciao Giulia,/);
  assert.match(e.html, /Agosto 2026 · 27 lug – 26 ago/);
  assert.match(e.html, /Hai risparmiato/);
  assert.match(e.html, /1\.054,01/);
  assert.match(e.html, /Il 50% di quello che è entrato, 72,00 € meno del mese prima\./);
  assert.match(e.html, /2\.100,00/);       // entrate
  assert.match(e.text, /Hai risparmiato: 1\.054,01 €, il 50%/);
  assert.ok(e.html.includes(links.unsubscribe.replace(/&/g, "&amp;")));
  assert.ok(e.text.includes(links.unsubscribe));
  assert.ok(e.html.includes(links.recap));
  // mese solare: niente intervallo
  assert.match(monthlyEmail({ name: null, payDay: 0, recap: buildRecap(txs, { from: "2026-08-01", to: "2026-08-31" }, []) }, links).html, /Agosto 2026<\/p>/);
});

test("speso più di quanto è entrato: frase e colore diversi", () => {
  const over = [tx("2026-07-27", 1000, "Stipendio"), tx("2026-08-02", -800, "Casa"), tx("2026-08-20", -400, "Viaggi"), tx("2026-08-25", -20, "Bar")];
  const raw = monthlyEmail({ name: null, payDay: 27, recap: buildRecap(over, AGO, []) }, links);
  const e = { ...raw, html: sp(raw.html) };
  assert.equal(e.variant, "overspent");
  assert.match(e.html, /Hai speso più di quanto è entrato/);
  assert.match(e.html, /−220,00/);
  assert.doesNotMatch(e.html, /di quello che è entrato/);
  assert.match(e.html, /Ciao,/);
});

test("da ricordare: spese cambiate, spese fisse trovate e budget", () => {
  const r = buildRecap(txs, AGO, [LUG, GIU, MAG, APR], [{ category_id: "ristoranti", monthly_budget: 50 }], fixed, "2026-08-27");
  const h = monthlyHighlights(r).map(sp);
  assert.ok(h.some(l => /Ristoranti: .* più del solito \(82,00 €\)/.test(l)), h.join(" | "));
  assert.ok(h.includes("🧾 Spese fisse: 2 su 3 trovate nei movimenti"), h.join(" | "));
  assert.ok(h.includes("🎯 Budget rispettati: 0 su 1. Superato: Ristoranti di 32,00 €"), h.join(" | "));
  const ok = buildRecap(txs, AGO, [LUG], [{ category_id: "ristoranti", monthly_budget: 100 }]);
  assert.ok(monthlyHighlights(ok).includes("🎯 Budget rispettato"));
  // senza niente da dire il blocco non c'è
  const plain = buildRecap([tx("2026-07-27", 2100, "Stipendio"), tx("2026-08-02", -800, "Casa"), tx("2026-08-25", -10, "Bar")], AGO, []);
  assert.doesNotMatch(monthlyEmail({ name: null, payDay: 27, recap: plain }, links).html, /Da ricordare/);
});

test("nomi dell'utente e delle categorie non possono iniettare HTML", () => {
  const evil = [
    tx("2026-07-27", 2100, "Stipendio"), tx("2026-08-02", -800, "Casa"), tx("2026-08-25", -10, "Bar"),
    tx("2026-08-20", -300, '<img src=x onerror="y">'),
  ];
  const r = buildRecap(evil, AGO, [LUG], [{ category_id: '<img src=x onerror="y">'.toLowerCase(), monthly_budget: 10 }]);
  const e = monthlyEmail({ name: "<script>x</script>", payDay: 27, recap: r }, links);
  assert.doesNotMatch(e.html, /<script>|<img src=x/);
  assert.match(e.html, /&lt;script&gt;/);
});

test("prima del 7 dicembre il giro non manda niente e non tocca il database", async () => {
  assert.equal(MONTHLY_FIRST_DAY, "2026-12-07");
  assert.equal(monthlyStarted("2026-12-06"), false);
  assert.equal(monthlyStarted("2026-12-07"), true);
  assert.equal(monthlyStartLabel(), "7 dicembre");
  const untouchable = new Proxy({}, { get() { throw new Error("il database non va toccato"); } }) as unknown as SupabaseClient;
  const r = await runMonthlyEmails(untouchable, new Date("2026-11-27T17:00:00Z"));
  assert.deepEqual(r, { sent: 0, skipped: 0, already: 0, failed: 0, notReady: {}, variants: {}, notStarted: true });
});
