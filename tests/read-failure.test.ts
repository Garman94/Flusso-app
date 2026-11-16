import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import {
  apiFailure, noRowsFailure, exceptionFailure, sizeBucket, elapsedSeconds, isEncryptedPdf, isHeic,
} from "../lib/read-failure";

const apiErr = (status: number, body: object) => Anthropic.APIError.generate(status, body, undefined, new Headers());

test("errori dell'API: ogni caso ha il suo codice", () => {
  assert.equal(apiFailure(apiErr(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } })), "api_auth");
  assert.equal(apiFailure(apiErr(403, { type: "error", error: { type: "permission_error", message: "no" } })), "api_auth");
  assert.equal(apiFailure(apiErr(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } })), "api_rate");
  assert.equal(apiFailure(apiErr(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } })), "api_overloaded");
  assert.equal(apiFailure(apiErr(500, { type: "error", error: { type: "api_error", message: "boom" } })), "api_overloaded");
  assert.equal(apiFailure(apiErr(400, { type: "error", error: { type: "invalid_request_error", message: "The PDF specified was not valid." } })), "api_bad_request");
});

test("credito Anthropic finito: arriva come 400 ma va contato a parte", () => {
  const err = apiErr(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } });
  assert.equal(apiFailure(err), "api_credit");
});

test("tempo scaduto e connessione caduta", () => {
  assert.equal(apiFailure(new Anthropic.APIConnectionTimeoutError()), "api_timeout");
  assert.equal(apiFailure(new Anthropic.APIConnectionError({ message: undefined })), "api_network");
  assert.equal(apiFailure(new Error("qualcos'altro")), "api_other");
  assert.equal(apiFailure(undefined), "api_other");
});

test("nessun movimento: risposta vuota, a parole, tagliata, righe illeggibili, elenco vuoto", () => {
  assert.equal(noRowsFailure("", 0, "end_turn"), "empty_reply");
  assert.equal(noRowsFailure("   ", 0, "end_turn"), "empty_reply");
  assert.equal(noRowsFailure("Non vedo movimenti in questa immagine.", 0, "end_turn"), "not_json");
  assert.equal(noRowsFailure('{"opening_balance": 100, "transactions": [', 0, "max_tokens"), "truncated");
  assert.equal(noRowsFailure('[{"date": "", "amount": null}]', 1, "end_turn"), "rows_unreadable");
  assert.equal(noRowsFailure("[]", 0, "end_turn"), "no_rows");
});

test("eccezioni prese dal browser", () => {
  assert.equal(exceptionFailure(new Error("An unexpected response was received from the server.")), "bad_response");
  assert.equal(exceptionFailure(new TypeError("Failed to fetch")), "network");
  assert.equal(exceptionFailure(new TypeError("Load failed")), "network");
  assert.equal(exceptionFailure(new TypeError("NetworkError when attempting to fetch resource.")), "network");
  assert.equal(
    exceptionFailure(new Error("An error occurred in the Server Components render. The specific message is omitted in production builds")),
    "server_crash",
  );
  assert.equal(exceptionFailure("strano"), "unknown");
});

test("dimensione a fasce", () => {
  assert.equal(sizeBucket(120_000), "<0.5MB");
  assert.equal(sizeBucket(700_000), "0.5-1MB");
  assert.equal(sizeBucket(1_500_000), "1-2MB");
  assert.equal(sizeBucket(2_900_000), "2-3MB");
  assert.equal(sizeBucket(5_000_000), ">3MB");
});

test("secondi passati, arrotondati e mai negativi", () => {
  assert.equal(elapsedSeconds(1_000, 11_400), 10);
  assert.equal(elapsedSeconds(1_000, 1_600), 1);
  assert.equal(elapsedSeconds(5_000, 1_000), 0);
});

test("PDF protetto: si riconosce dal dizionario /Encrypt", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);
  const protetto = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 5 0 R /ID [<ab><cd>] >>\n%%EOF";
  const libero = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
  assert.equal(isEncryptedPdf(bytes(protetto)), true);
  assert.equal(isEncryptedPdf(bytes(libero)), false);
  // "/EncryptMetadata" da solo non basta: serve la parola intera
  assert.equal(isEncryptedPdf(bytes("<< /EncryptMetadata false >>")), false);
});

test("foto HEIC dell'iPhone", () => {
  assert.equal(isHeic({ type: "image/heic", name: "IMG_0001.HEIC" }), true);
  assert.equal(isHeic({ type: "", name: "foto.heif" }), true);
  assert.equal(isHeic({ type: "image/jpeg", name: "foto.jpg" }), false);
});
