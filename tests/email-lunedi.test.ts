import { test } from "node:test";
import assert from "node:assert/strict";
import { weeklyEmail, upcomingThisWeek, isStale, STALE_DAYS, weeklyStarted, firstMondayLabel, WEEKLY_FIRST_MONDAY, type WeeklyEmailInput } from "../lib/weekly-email";
import { runWeeklyEmails } from "../lib/weekly-email-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unsubscribeToken, verifyUnsubscribe, unsubscribeQuery } from "../lib/email-token";
import { escapeHtml } from "../lib/email-layout";
import { heroNumbers, txSumToToday } from "../lib/hero-numbers";
import type { UpcomingRow } from "../lib/upcoming";

const links = {
  dashboard: "https://x.it/dashboard?da=email-lunedi",
  importFile: "https://x.it/dashboard/transazioni?da=email-lunedi&import=1",
  budget: "https://x.it/dashboard/smart?da=email-lunedi&v=budget",
  settings: "https://x.it/dashboard/account?da=email-lunedi#avvisi",
  unsubscribe: "https://x.it/disiscriviti?u=1&k=weekly&t=abc",
};

const base: WeeklyEmailInput = {
  name: "Giulia Rossi",
  today: "2026-11-16",
  payDay: 27,
  periodTo: "2026-11-26",
  lastTxDate: "2026-11-14",
  spend: { kind: "ok", amount: 412.5, perDay: 37.5, days: 11, capped: false },
  committed: 0,
  upcoming: [],
};

const row = (p: Partial<UpcomingRow>): UpcomingRow => ({
  id: "r", name: "Affitto", kind: "fixed", amount: 650, date: "2026-11-19", daysTo: 3, state: "upcoming", ...p,
});

test("caso normale: numero grande, al giorno, mai importi nell'oggetto", () => {
  const e = weeklyEmail(base, links);
  assert.equal(e.variant, "ok");
  assert.equal(e.subject, "Quanto puoi spendere fino al 26 nov");
  assert.doesNotMatch(e.subject + e.preheader, /\d+,\d{2}|€/);
  assert.match(e.html, /Ciao Giulia,/);
  assert.match(e.html, /412,50/);
  assert.match(e.html, /37,50/);
  assert.match(e.html, /per 11 giorni/);
  assert.match(e.html, /Fino al prossimo stipendio \(26 nov\)/);
  assert.match(e.text, /puoi spendere ancora 412,50/);
  assert.ok(e.html.includes(links.unsubscribe.replace(/&/g, "&amp;")));
  assert.ok(e.text.includes(links.unsubscribe));
});

test("movimenti vecchi: invita a caricare il file e non dice quanto spendere", () => {
  const e = weeklyEmail({ ...base, lastTxDate: "2026-11-03" }, links);
  assert.equal(e.variant, "stale");
  assert.match(e.html, /del 3 nov/);
  assert.doesNotMatch(e.html, /412,50/);
  assert.ok(e.html.includes(links.importFile.replace(/&/g, "&amp;")));
  assert.equal(STALE_DAYS, 7);
  assert.equal(isStale("2026-11-09", "2026-11-16"), false); // 7 giorni: ancora buono
  assert.equal(isStale("2026-11-08", "2026-11-16"), true);
  assert.equal(isStale(null, "2026-11-16"), true);
});

test("le altre situazioni hanno frasi calme e un passo da fare", () => {
  assert.equal(weeklyEmail({ ...base, spend: null }, links).variant, "no-balance");
  const over = weeklyEmail({ ...base, spend: { kind: "over", amount: 80, days: 11 }, committed: 650 }, links);
  assert.equal(over.variant, "over");
  assert.match(over.html, /Hai superato il budget di 80,00/);
  assert.match(over.html, /650,00/);
  const short = weeklyEmail({ ...base, spend: { kind: "short", amount: 120, days: 11 } }, links);
  assert.match(short.html, /Mancano 120,00/);
  const noBudget = weeklyEmail({ ...base, spend: { kind: "no-budget" } }, links);
  assert.equal(noBudget.variant, "no-budget");
  assert.ok(noBudget.html.includes(links.budget.replace(/&/g, "&amp;")));
  const capped = weeklyEmail({ ...base, spend: { kind: "ok", amount: 100, perDay: 9.09, days: 11, capped: true }, committed: 50 }, links);
  assert.match(capped.html, /resta sul conto/);
});

test("da pagare questa settimana: solo i prossimi 7 giorni, non pagate, al massimo 5", () => {
  const rows = [
    row({ id: "a", name: "Affitto", daysTo: 3 }),
    row({ id: "b", name: "Netflix", daysTo: 0, date: "2026-11-16", amount: 13.99 }),
    row({ id: "c", name: "Luce", daysTo: 7, date: "2026-11-23" }),      // tra 7 giorni: fuori
    row({ id: "d", name: "Palestra", state: "paid" }),                    // già pagata
    row({ id: "e", name: "Telefono", state: "missing", daysTo: -2 }),     // scaduta e non trovata: non qui
    row({ id: "f", name: "Mutuo", kind: "rate", state: "unverifiable", daysTo: 5, date: "2026-11-21" }),
  ];
  assert.deepEqual(upcomingThisWeek(rows).map(r => r.name), ["Netflix", "Affitto", "Mutuo"]);
  const many = Array.from({ length: 8 }, (_, i) => row({ id: String(i), name: `Spesa ${i}`, daysTo: i % 7 }));
  assert.equal(upcomingThisWeek(many).length, 5);

  const e = weeklyEmail({ ...base, upcoming: rows }, links);
  assert.match(e.html, /Da pagare questa settimana/);
  assert.match(e.html, /Netflix/);
  assert.match(e.html, /oggi, 16 nov/);
  assert.match(e.html, /tra 3 giorni, 19 nov/);
  assert.doesNotMatch(e.html, /Palestra|Luce|Telefono/);
  assert.match(e.text, /- Affitto: 650,00/);
  // senza spese in arrivo il blocco non c'è
  assert.doesNotMatch(weeklyEmail(base, links).html, /Da pagare questa settimana/);
});

test("nomi dell'utente e delle spese non possono iniettare HTML", () => {
  const e = weeklyEmail({ ...base, name: "<script>x</script>", upcoming: [row({ name: '<img src=x onerror="y">' })] }, links);
  assert.doesNotMatch(e.html, /<script>|<img src=x/);
  assert.match(e.html, /&lt;script&gt;/);
  assert.equal(escapeHtml(`a&b<"'>`), "a&amp;b&lt;&quot;&#39;&gt;");
  // senza nome
  assert.match(weeklyEmail({ ...base, name: "  " }, links).html, /Ciao,/);
});

test("link per disiscriversi: firmato, non si falsifica, non vale per un altro utente o tipo", () => {
  const key = "chiave-di-prova";
  const u = "11111111-2222-3333-4444-555555555555";
  const t = unsubscribeToken(u, "weekly", key);
  assert.equal(t.length, 32);
  assert.equal(verifyUnsubscribe(u, "weekly", t, key), true);
  assert.equal(verifyUnsubscribe(u, "monthly", t, key), false);
  assert.equal(verifyUnsubscribe("11111111-2222-3333-4444-555555555556", "weekly", t, key), false);
  assert.equal(verifyUnsubscribe(u, "weekly", t, "altra-chiave"), false);
  assert.equal(verifyUnsubscribe(u, "weekly", t.slice(0, 31), key), false);
  assert.equal(verifyUnsubscribe(u, "tutte", t, key), false);
  assert.equal(verifyUnsubscribe("non-un-id", "weekly", t, key), false);
  assert.equal(unsubscribeQuery(u, "weekly", key), `u=${u}&k=weekly&t=${encodeURIComponent(t)}`);
});

test("numeri della card (usati anche dall'email): senza saldo niente, altrimenti saldo e puoi spendere", () => {
  const input = {
    startingBalance: null as number | null,
    items: [],
    periodTxs: [
      { amount: -50, date: "2026-11-10", categories: { name: "Spesa" } },
      { amount: -30, date: "2026-11-20", categories: { name: "Spesa" } }, // dopo oggi: non nel saldo di oggi
      { amount: 2000, date: "2026-10-27", categories: { name: "Stipendio" } },
    ],
    budgetTotal: 600,
    ownerIncome: null,
    membersIncome: [],
    piggyBalance: 0,
    periodFrom: "2026-10-27",
    periodTo: "2026-11-26",
    today: "2026-11-16",
  };
  assert.equal(heroNumbers(input), null);
  assert.equal(txSumToToday(input.periodTxs, input.today), 1950);
  const h = heroNumbers({ ...input, startingBalance: 1000 })!;
  assert.equal(h.actualToday, 2950);
  assert.equal(h.flexiblePlanned, 600);
  // 600 di budget, spese 80: ne restano 520, e sul conto ce n'è abbastanza
  assert.deepEqual(h.spend, { kind: "ok", amount: 520, perDay: 47.27, days: 11, capped: false });
});

test("prima del 7 dicembre il giro non manda niente (15 giorni di avviso della privacy)", async () => {
  assert.equal(WEEKLY_FIRST_MONDAY, "2026-12-07");
  assert.equal(weeklyStarted("2026-11-23"), false);
  assert.equal(weeklyStarted("2026-11-30"), false);
  assert.equal(weeklyStarted("2026-12-07"), true);
  assert.equal(weeklyStarted("2027-01-04"), true);
  assert.equal(firstMondayLabel(), "lunedì 7 dicembre");

  // lunedì 23 novembre, 7 del mattino a Roma: il giro si ferma prima di toccare il database
  const untouchable = new Proxy({}, { get() { throw new Error("il database non va toccato"); } }) as unknown as SupabaseClient;
  const r = await runWeeklyEmails(untouchable, new Date("2026-11-23T06:00:00Z"));
  assert.deepEqual(r, { sent: 0, skipped: 0, already: 0, failed: 0, variants: {}, notStarted: true });
  // anche la domenica prima del 7 (il lunedì del giro è ancora il 30/11)
  assert.equal((await runWeeklyEmails(untouchable, new Date("2026-12-06T20:00:00Z"))).notStarted, true);
});
