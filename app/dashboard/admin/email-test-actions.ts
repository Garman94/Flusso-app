"use server";

// Admin: prova delle email automatiche (del lunedì e del mese) sul proprio account. I cron di
// Vercel girano solo in produzione: in anteprima (e prima della partenza) le email si vedono da qui.
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin-emails";
import { buildWeeklyEmail, sendEmail } from "@/lib/weekly-email-server";
import { buildMonthlyEmail } from "@/lib/monthly-email-server";
import type { EmailKind } from "@/lib/email-token";

type TestResult = { html?: string; sentTo?: string; variant?: string; note?: string; error?: string };

/** Perché l'email del mese, oggi, non partirebbe da sola (la si vede lo stesso). */
const NOT_SENT: Record<string, string> = {
  window: "Oggi non partirebbe da sola: parte nei primi 10 giorni dopo lo stipendio.",
  few: "Non partirebbe: nel mese ci sono meno di 3 movimenti.",
  incomplete: "Non partirebbe: mancano i movimenti degli ultimi giorni del mese.",
  "starts-late": "Non partirebbe: i movimenti cominciano a metà mese.",
};

export async function emailTest(kind: EmailKind, mode: "preview" | "send"): Promise<TestResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  const userId = data?.claims?.sub;
  if (!userId || !isAdminEmail(email)) return { error: "Solo per l'admin." };

  try {
    const service = createServiceClient();
    const { data: profile, error } = await service.from("profiles").select("*").eq("id", userId).single();
    if (error || !profile) return { error: "Profilo non trovato." };

    let built: { subject: string; html: string; text: string; variant: string } | null;
    let note: string | undefined;
    if (kind === "monthly") {
      const res = await buildMonthlyEmail(service, profile, new Date(), { anyDay: true });
      built = res.email;
      if (!built) return { error: "Non hai movimenti nell'ultimo mese chiuso: l'email non partirebbe." };
      note = NOT_SENT[res.reason];
    } else {
      built = await buildWeeklyEmail(service, profile);
      if (!built) return { error: "Non hai movimenti: l'email non partirebbe." };
    }

    if (mode === "preview") return { html: built.html, variant: built.variant, note };
    await sendEmail(email!, userId, built, kind);
    return { sentTo: email, variant: built.variant, note };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Errore." };
  }
}
