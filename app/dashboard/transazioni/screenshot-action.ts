"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEffectivePlan } from "@/lib/preview-plan";
import { isPremium } from "@/lib/plans";
import { todayISO } from "@/lib/dates";
import { buildPrompt, parseExtraction, type ExtractedTransaction } from "@/lib/screenshot-extract";

// Un file "use server" non può ri-esportare nulla, nemmeno i tipi (Next li tratta come export a runtime):
// chi ha bisogno del tipo lo importa da @/lib/screenshot-extract.

/** Analisi per utente nelle ultime 24 ore: ogni chiamata costa, meglio un tetto. */
const DAILY_LIMIT = 20;
/** ~4 MB di immagine in base64: il client la riduce prima, questo è solo un paracadute. */
const MAX_BASE64_CHARS = 5_500_000;

type Result = { transactions?: ExtractedTransaction[]; warning?: string; error?: string };

/** Conta le analisi delle ultime 24 ore e ne registra una nuova. Se la tabella eventi manca, non blocca. */
async function overDailyLimit(userId: string): Promise<boolean> {
  try {
    const service = createServiceClient();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error } = await service
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("name", "screenshot_extract")
      .gte("created_at", since);
    if (error) return false;
    if ((count ?? 0) >= DAILY_LIMIT) return true;
    await service.from("events").insert({ user_id: userId, name: "screenshot_extract", props: {} });
    return false;
  } catch {
    return false;
  }
}

export async function extractTransactionsFromScreenshot(
  base64Image: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<Result> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { error: "Non autenticato." };
  const userId = claims.claims.sub as string;

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", userId).single();
  const plan = await getEffectivePlan(profile?.plan ?? "free", profile?.trial_ends_at);
  if (!isPremium(plan)) return { error: "L'import da screenshot è una funzione Premium." };

  if (!process.env.ANTHROPIC_API_KEY) {
    // Configurazione mancante: il dettaglio va nei log, all'utente un messaggio comprensibile
    console.error("[screenshot] ANTHROPIC_API_KEY non configurata: import da screenshot non disponibile");
    return { error: "L'import da screenshot non è ancora attivo. Nel frattempo puoi caricare un file Excel o CSV." };
  }
  if (!base64Image || base64Image.length > MAX_BASE64_CHARS) {
    return { error: "L'immagine è troppo grande. Prova con uno screenshot più piccolo." };
  }
  if (await overDailyLimit(userId)) {
    return { error: `Hai raggiunto il limite di ${DAILY_LIMIT} analisi nelle ultime 24 ore. Riprova domani.` };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const today = todayISO();

  let raw = "";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
            { type: "text", text: buildPrompt(today) },
          ],
        },
      ],
    });
    raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch (err) {
    console.error("[screenshot] errore API Anthropic:", err instanceof Error ? err.message : err);
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401 || err.status === 403) return { error: "L'import da screenshot non è ancora attivo. Nel frattempo puoi caricare un file Excel o CSV." };
      if (err.status === 429) return { error: "Troppe richieste in questo momento. Riprova tra un minuto." };
      if (err.status === 400) return { error: "Non riesco a leggere questa immagine. Usa uno screenshot PNG o JPG." };
    }
    return { error: "L'analisi non è riuscita. Riprova tra poco." };
  }

  const { transactions, truncated, dropped } = parseExtraction(raw, today);
  if (transactions.length === 0) {
    console.error("[screenshot] nessun movimento leggibile; risposta:", raw.slice(0, 300));
    return { error: "Non ho trovato movimenti in questa immagine. Controlla che si vedano date e importi." };
  }

  const notes: string[] = [];
  if (truncated) notes.push("L'elenco era molto lungo: ho letto solo una parte dei movimenti. Carica anche il resto in un secondo screenshot.");
  if (dropped > 0) notes.push(`${dropped} righe senza data o importo leggibili sono state ignorate.`);
  return { transactions, warning: notes.length ? notes.join(" ") : undefined };
}
