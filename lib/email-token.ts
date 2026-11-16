// Link per disiscriversi dalle email senza entrare in Flusso. Solo lato server.
// Il link porta l'id dell'utente, il tipo di email e una firma (HMAC): senza la chiave del
// server nessuno può costruire il link di un altro e spegnergli le email.
// Chiave: EMAIL_LINK_SECRET se c'è, altrimenti la service role di Supabase (sta solo sul server).
// Cambiando la chiave i link delle email già mandate smettono di funzionare: si disiscrive da Account.
import { createHmac, timingSafeEqual } from "node:crypto";

export type EmailKind = "weekly" | "monthly";
export const EMAIL_KINDS: EmailKind[] = ["weekly", "monthly"];

function serverSecret(): string {
  const s = process.env.EMAIL_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Manca la chiave per firmare i link delle email");
  return s;
}

export function isEmailKind(k: unknown): k is EmailKind {
  return typeof k === "string" && (EMAIL_KINDS as string[]).includes(k);
}

/** Firma corta (32 caratteri) per il link di disiscrizione. */
export function unsubscribeToken(userId: string, kind: EmailKind, key: string = serverSecret()): string {
  return createHmac("sha256", key).update(`unsubscribe:${kind}:${userId}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(userId: string, kind: string, token: string, key: string = serverSecret()): boolean {
  if (!isEmailKind(kind) || !/^[0-9a-f-]{36}$/i.test(userId) || typeof token !== "string") return false;
  const expected = Buffer.from(unsubscribeToken(userId, kind, key));
  const got = Buffer.from(token);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Parametri del link (u, k, t), per la pagina e per l'intestazione List-Unsubscribe. */
export function unsubscribeQuery(userId: string, kind: EmailKind, key?: string): string {
  const t = unsubscribeToken(userId, kind, key);
  return `u=${encodeURIComponent(userId)}&k=${kind}&t=${encodeURIComponent(t)}`;
}
