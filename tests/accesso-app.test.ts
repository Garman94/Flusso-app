import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_AUTH_REDIRECT, safeNext } from "../lib/auth-return";

const BASE = "https://www.flussoapp.it/auth/callback?code=x";

test("dopo l'accesso solo pagine di Flusso, mai un altro sito", () => {
  assert.equal(safeNext("/dashboard", BASE), "/dashboard");
  assert.equal(safeNext("/dashboard/transazioni?import=1#lista", BASE), "/dashboard/transazioni?import=1#lista");
  assert.equal(safeNext(null, BASE), "/dashboard");
  for (const bad of [
    "https://evil.it",
    "//evil.it",
    "/\\evil.it",
    "/\t/evil.it",
    "/\n/evil.it",
    "javascript:alert(1)",
    "dashboard",
    "",
  ]) assert.equal(safeNext(bad, BASE), "/dashboard", JSON.stringify(bad));
});

test("il link di ritorno dell'app è lo stesso nel sito, nell'app Android e in MainActivity", () => {
  const url = new URL(APP_AUTH_REDIRECT);
  const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  const activity = readFileSync(new URL("../android/app/src/main/java/it/flussoapp/MainActivity.java", import.meta.url), "utf8");
  const scheme = url.protocol.replace(":", "");
  assert.match(manifest, new RegExp(`android:scheme="${scheme.replace(".", "\\.")}" android:host="${url.host}" android:path="${url.pathname}"`));
  assert.ok(activity.includes(`"${scheme}".equals(data.getScheme())`));
  assert.ok(activity.includes(`"${url.host}".equals(data.getHost())`));
  assert.ok(activity.includes(`"${url.pathname}".equals(data.getPath())`));
  // MainActivity riapre il ritorno sul sito che l'app carica
  const config = readFileSync(new URL("../capacitor.config.ts", import.meta.url), "utf8");
  const site = config.match(/url:\s*'([^']+)'/)?.[1];
  assert.ok(site && activity.includes(`SITE = "${site}"`), "SITE in MainActivity = server.url in capacitor.config.ts");
});
