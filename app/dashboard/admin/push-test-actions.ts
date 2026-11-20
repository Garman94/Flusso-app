"use server";

// Admin: ricevere subito la notifica del lunedì sui propri dispositivi (i cron girano solo in
// produzione e una volta a settimana). Non scrive in email_sends: il lunedì arriva lo stesso.
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin-emails";
import { WEEKLY_PUSH_TTL } from "@/lib/push";
import { buildWeeklyPush, pushConfigured, sendToDevices, userDevices } from "@/lib/push-server";

export async function adminWeeklyPush(): Promise<{ message: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || !isAdminEmail(data.claims.email as string | undefined)) return { message: "Solo per l'admin." };
  if (!pushConfigured()) return { message: "Mancano le chiavi VAPID su Vercel." };
  try {
    const service = createServiceClient();
    const rows = await userDevices(service, userId);
    if (!rows.length) return { message: "Accendi prima le notifiche da Account → Avvisi, su questo telefono o computer." };
    const payload = await buildWeeklyPush(service, userId);
    if (!payload) return { message: "Non hai movimenti: la notifica non partirebbe." };
    const { variant, ...message } = payload;
    const out = await sendToDevices(service, rows, message, WEEKLY_PUSH_TTL);
    const gone = out.gone ? ` ${out.gone} dispositivi non c'erano più e li ho tolti.` : "";
    return { message: out.ok ? `Mandata a ${out.ok} dispositivi (versione: ${variant}).${gone}` : `Non è arrivata a nessun dispositivo.${gone}` };
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Errore." };
  }
}
