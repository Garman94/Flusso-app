"use server";

// Admin: prova dell'email del lunedì sul proprio account. I cron di Vercel girano solo in
// produzione: in anteprima (e prima del primo lunedì) l'email si vede da qui.
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin-emails";
import { buildWeeklyEmail, sendEmail } from "@/lib/weekly-email-server";

export async function weeklyEmailTest(mode: "preview" | "send"): Promise<{ html?: string; sentTo?: string; variant?: string; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  const userId = data?.claims?.sub;
  if (!userId || !isAdminEmail(email)) return { error: "Solo per l'admin." };

  try {
    const service = createServiceClient();
    const { data: profile, error } = await service.from("profiles").select("*").eq("id", userId).single();
    if (error || !profile) return { error: "Profilo non trovato." };
    const built = await buildWeeklyEmail(service, profile);
    if (!built) return { error: "Non hai movimenti: l'email non partirebbe." };
    if (mode === "preview") return { html: built.html, variant: built.variant };
    await sendEmail(email!, userId, built);
    return { sentTo: email, variant: built.variant };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Errore." };
  }
}
