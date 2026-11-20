"use server";

// Notifiche push: accendere, spegnere e provare le notifiche su questo dispositivo (Account →
// Avvisi) e spegnerle uscendo dall'account (logout-button.tsx).
// Scrive con la service role (la tabella non ha policy) dopo aver controllato chi è collegato.
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isDemoEmail } from "@/lib/demo";
import { isDevice, isPushEndpoint, parseSubscription, TEST_PUSH } from "@/lib/push";
import { pushConfigured, removeSubscription, sendToDevices, storeSubscription, userDevices } from "@/lib/push-server";

type Result = { ok: true } | { error: string };

async function currentUser(): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return { error: "Non sei collegato." };
  if (isDemoEmail(data.claims.email as string | undefined)) return { error: "Registrati per attivare le notifiche." };
  return { id };
}

/** Salva questo dispositivo (anche a ogni visita di Account, per riprendere un indirizzo cambiato). */
export async function savePushDevice(raw: unknown, device: unknown): Promise<Result> {
  const user = await currentUser();
  if ("error" in user) return user;
  if (!pushConfigured()) return { error: "Le notifiche arrivano presto." };
  const sub = parseSubscription(raw);
  if (!sub) return { error: "Questo browser ha dato dati che non riconosco." };
  try {
    await storeSubscription(createServiceClient(), user.id, sub, isDevice(device) ? device : null);
    return { ok: true };
  } catch {
    return { error: "Errore nel salvataggio." };
  }
}

export async function removePushDevice(endpoint: string): Promise<Result> {
  const user = await currentUser();
  if ("error" in user) return user;
  if (typeof endpoint !== "string" || !isPushEndpoint(endpoint)) return { ok: true };
  try {
    await removeSubscription(createServiceClient(), user.id, endpoint);
    return { ok: true };
  } catch {
    return { error: "Errore nel salvataggio." };
  }
}

/** «Mandami una prova»: solo a questo dispositivo, e solo se è dell'utente collegato. */
export async function sendTestPush(endpoint: string): Promise<Result> {
  const user = await currentUser();
  if ("error" in user) return user;
  if (!pushConfigured()) return { error: "Le notifiche arrivano presto." };
  if (typeof endpoint !== "string" || !isPushEndpoint(endpoint)) return { error: "Accendi prima le notifiche." };
  try {
    const service = createServiceClient();
    const rows = await userDevices(service, user.id, endpoint);
    if (!rows.length) return { error: "Questo dispositivo non risulta acceso: spegni e riaccendi le notifiche." };
    const out = await sendToDevices(service, rows, TEST_PUSH, 300);
    if (out.ok) return { ok: true };
    if (out.gone) return { error: "Il browser ha tolto il permesso: spegni e riaccendi le notifiche." };
    return { error: "La notifica non è partita. Riprova tra poco." };
  } catch {
    return { error: "La notifica non è partita. Riprova tra poco." };
  }
}
