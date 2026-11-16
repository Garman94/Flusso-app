// Spegne un'email per un utente dal link firmato (pagina /disiscriviti e intestazione
// List-Unsubscribe). Solo lato server: scrive con la service role.
import { createServiceClient } from "./supabase/service";
import { verifyUnsubscribe, type EmailKind } from "./email-token";

const COLUMN: Record<EmailKind, string> = { weekly: "email_weekly", monthly: "email_monthly" };

export async function unsubscribe(userId: string, kind: string, token: string): Promise<boolean> {
  if (!verifyUnsubscribe(userId, kind, token)) return false;
  const { error } = await createServiceClient()
    .from("profiles")
    .update({ [COLUMN[kind as EmailKind]]: false })
    .eq("id", userId);
  return !error;
}
