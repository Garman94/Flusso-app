import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPushEndpoint, parseSubscription, deviceLabel, pushSupport, weeklyPush, base64UrlToBytes, sameKey,
  PUSH_SOURCE, TEST_PUSH, type PushPayload, type PushSubscriptionInput,
} from "../lib/push";
import { runWeeklyPushes, type SendOutcome } from "../lib/push-server";

const P256DH = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";

test("solo i servizi di notifiche dei browser, niente indirizzi a caso", () => {
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://web.push.apple.com/QGx1",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
    "https://wns2-db5p.notify.windows.com/w/?token=x",
  ]) assert.ok(isPushEndpoint(ok), ok);
  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.it/x",
    "https://evilpush.apple.com/x",
    "https://push.apple.com.evil.it/x",
    "https://example.com/push",
    "https://fcm.googleapis.com",
    `https://fcm.googleapis.com/${"a".repeat(1000)}`,
  ]) assert.ok(!isPushEndpoint(bad), bad);
});

test("i dati del browser: chiavi controllate, '=' finali tolti", () => {
  const sub = parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/x", expirationTime: null, keys: { p256dh: P256DH, auth: `${AUTH}==` } });
  assert.deepEqual(sub, { endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: P256DH, auth: AUTH });
  assert.equal(parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "<script>", auth: AUTH } }), null);
  assert.equal(parseSubscription({ endpoint: "https://example.com/x", keys: { p256dh: P256DH, auth: AUTH } }), null);
  assert.equal(parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/x" }), null);
  assert.equal(parseSubscription("ciao"), null);
  assert.equal(parseSubscription(null), null);
});

test("tipo di dispositivo e se le notifiche si possono accendere", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
  const webview = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36";
  const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
  assert.equal(deviceLabel(iphone), "iPhone");
  assert.equal(deviceLabel(ipad, 5), "iPad");
  assert.equal(deviceLabel(ipad, 0), "Mac");
  assert.equal(deviceLabel(android), "Android");
  assert.equal(deviceLabel(windows), "Windows");

  const env = { touchPoints: 0, standalone: false, hasPush: false, nativeApp: false };
  assert.equal(pushSupport({ ...env, ua: android, hasPush: true }), "ok");
  assert.equal(pushSupport({ ...env, ua: webview, hasPush: true }), "android-app"); // app Android: WebView
  assert.equal(pushSupport({ ...env, ua: android, hasPush: true, nativeApp: true }), "android-app");
  assert.equal(pushSupport({ ...env, ua: iphone }), "ios-browser");                 // Safari, non dalla Home
  assert.equal(pushSupport({ ...env, ua: iphone, standalone: true }), "ios-old");   // dalla Home ma iOS vecchio
  assert.equal(pushSupport({ ...env, ua: iphone, standalone: true, hasPush: true }), "ok");
  assert.equal(pushSupport({ ...env, ua: windows }), "unsupported");
});

test("la notifica del lunedì: mai importi, link solo a pagine di Flusso", () => {
  const ok = weeklyPush({ today: "2026-11-23", payDay: 27, periodTo: "2026-11-26", lastTxDate: "2026-11-20" });
  assert.equal(ok.variant, "ok");
  assert.equal(ok.title, "Nuova settimana");
  assert.equal(ok.body, "Guarda quanto puoi spendere fino al prossimo stipendio (26 nov).");
  assert.equal(ok.url, `/dashboard?da=${PUSH_SOURCE}`);

  const stale = weeklyPush({ today: "2026-11-23", payDay: 27, periodTo: "2026-11-26", lastTxDate: "2026-11-10" });
  assert.equal(stale.variant, "stale");
  assert.equal(stale.body, "L'ultimo è del 10 nov. Carica l'estratto conto e Flusso ti dice quanto puoi spendere fino al prossimo stipendio (26 nov).");
  assert.equal(stale.url, `/dashboard/transazioni?import=1&da=${PUSH_SOURCE}`);

  const month = weeklyPush({ today: "2026-11-23", payDay: 0, periodTo: "2026-11-30", lastTxDate: null });
  assert.match(month.body, /^Carica l'estratto conto e Flusso ti dice quanto puoi spendere fino a fine mese \(30 nov\)\.$/);

  for (const p of [ok, stale, month, TEST_PUSH]) {
    assert.doesNotMatch(p.title + p.body, /€|\d+,\d{2}/);
    assert.ok(p.url.startsWith("/") && !p.url.startsWith("//"), p.url);
  }
  assert.match(`/dashboard?da=${PUSH_SOURCE}`.split("da=")[1], /^push-[a-z-]{1,30}$/); // lo riconosce ActivityPing
});

test("chiave VAPID: da base64url ai byte, e confronto con quella del dispositivo", () => {
  const key = base64UrlToBytes(P256DH);
  assert.equal(key.length, 65);
  assert.equal(key[0], 4); // chiave P-256 non compressa
  assert.ok(sameKey(key.slice().buffer, key));
  assert.ok(!sameKey(base64UrlToBytes(AUTH).buffer, key));
  assert.ok(!sameKey(null, key));
});

test("senza chiavi VAPID il giro non manda niente e non tocca il database", async () => {
  const untouchable = new Proxy({}, { get() { throw new Error("il database non va toccato"); } }) as unknown as SupabaseClient;
  const r = await runWeeklyPushes(untouchable, new Date("2026-11-23T06:00:00Z"), async () => "ok", false);
  assert.deepEqual(r, { sent: 0, devices: 0, gone: 0, errors: 0, already: 0, skipped: 0, variants: {}, notConfigured: true });
});

// Un finto database con le sole operazioni usate dal giro: select/insert/update/delete con eq, in, range, limit.
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  let nextId = 1000;
  function from(table: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    const filters: ((r: Row) => boolean)[] = [];
    let start = 0;
    let end = Infinity;
    let single = false;
    const run = () => {
      const rows = (tables[table] ??= []);
      const match = (r: Row) => filters.every(f => f(r));
      if (op === "insert") {
        if (table === "email_sends" && rows.some(r => r.user_id === payload.user_id && r.kind === payload.kind && r.period_key === payload.period_key)) {
          return { data: null, error: { code: "23505" } };
        }
        const row = { id: nextId++, ...payload };
        rows.push(row);
        return { data: single ? { id: row.id } : [row], error: null };
      }
      if (op === "delete") {
        tables[table] = rows.filter(r => !match(r));
        return { data: null, error: null };
      }
      if (op === "update") {
        rows.filter(match).forEach(r => Object.assign(r, payload));
        return { data: null, error: null };
      }
      const out = rows.filter(match).slice(start, end);
      return { data: single ? (out[0] ?? null) : out, error: null };
    };
    const b = {
      select: () => b,
      insert: (row: Row) => { op = "insert"; payload = row; return b; },
      update: (row: Row) => { op = "update"; payload = row; return b; },
      delete: () => { op = "delete"; return b; },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b; },
      in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return b; },
      order: () => b,
      limit: (n: number) => { end = start + n; return b; },
      range: (a: number, z: number) => { start = a; end = z + 1; return b; },
      maybeSingle: () => { single = true; return b; },
      then: (ok: (v: unknown) => void, ko: (e: unknown) => void) => { try { ok(run()); } catch (e) { ko(e); } },
    };
    return b;
  }
  return { from } as unknown as SupabaseClient;
}

test("il giro del lunedì: una volta a settimana, dispositivi spariti tolti, chi non ha movimenti saltato", async () => {
  const sub = (id: number, user_id: string, tag: string) =>
    ({ id, user_id, endpoint: `https://fcm.googleapis.com/fcm/send/${tag}`, p256dh: P256DH, auth: AUTH });
  const tables: Record<string, Row[]> = {
    push_subscriptions: [sub(1, "anna", "telefono"), sub(2, "anna", "vecchio-gone"), sub(3, "bruno", "pc"), sub(4, "carla", "tel")],
    profiles: [{ id: "anna", pay_day: 27 }, { id: "bruno", pay_day: 27 }, { id: "carla", pay_day: 0 }],
    transactions: [{ user_id: "anna", date: "2026-11-20" }, { user_id: "carla", date: "2026-11-21" }],
    email_sends: [{ id: 1, user_id: "carla", kind: "push_weekly", period_key: "2026-11-23" }], // già mandata
  };
  const sent: { to: string; payload: PushPayload }[] = [];
  const send = async (s: PushSubscriptionInput, payload: PushPayload): Promise<SendOutcome> => {
    sent.push({ to: s.endpoint.split("/").pop()!, payload });
    return s.endpoint.includes("gone") ? "gone" : "ok";
  };
  const db = fakeDb(tables);
  const now = new Date("2026-11-23T06:00:00Z");

  const r = await runWeeklyPushes(db, now, send, true);
  assert.deepEqual(r, { sent: 1, devices: 1, gone: 1, errors: 0, already: 1, skipped: 1, variants: { ok: 1 } });
  assert.deepEqual(sent.map(s => s.to), ["telefono", "vecchio-gone"]);
  assert.equal(sent[0].payload.body, "Guarda quanto puoi spendere fino al prossimo stipendio (26 nov).");
  assert.ok(!("variant" in sent[0].payload));                                                // al dispositivo solo il messaggio
  assert.deepEqual(tables.push_subscriptions.map(s => s.id), [1, 3, 4]);                     // il dispositivo sparito è tolto
  assert.equal(tables.push_subscriptions[0].last_ok_at, now.toISOString());
  // bruno non ha movimenti: la sua riga non resta, così riparte quando ne avrà
  assert.deepEqual(tables.email_sends.map(e => `${e.user_id}:${e.kind}`).sort(), ["anna:push_weekly", "carla:push_weekly"]);

  // lanciato due volte nella stessa settimana: nessuno la riceve di nuovo
  sent.length = 0;
  const again = await runWeeklyPushes(db, now, send, true);
  assert.equal(again.sent, 0);
  assert.equal(again.already, 2);
  assert.deepEqual(sent, []);
});
