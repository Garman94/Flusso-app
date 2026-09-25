"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEffectivePlan } from "@/lib/preview-plan";
import { isPremium } from "@/lib/plans";
import { todayISO } from "@/lib/dates";
import { buildBillPrompt, parseBillExtraction, type ExtractedSupply } from "@/lib/utilities";

// Lettura di bollette e contratti di luce e gas con l'AI (stesso modello dell'import da
// screenshot). Un file "use server" non può esportare tipi: ExtractedSupply sta in lib/utilities.

/** Letture per utente nelle ultime 24 ore: ogni chiamata costa. */
const DAILY_LIMIT = 10;
/** Il limite delle server action è 4 MB: un PDF fino a ~3 MB, le foto le riduce il browser. */
const MAX_BASE64_CHARS = 4_000_000;

type MediaType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
type Result = { supplies?: ExtractedSupply[]; error?: string };

async function overDailyLimit(userId: string): Promise<boolean> {
  try {
    const service = createServiceClient();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error } = await service
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("name", "bill_extract")
      .gte("created_at", since);
    if (error) return false;
    if ((count ?? 0) >= DAILY_LIMIT) return true;
    await service.from("events").insert({ user_id: userId, name: "bill_extract", props: {} });
    return false;
  } catch {
    return false;
  }
}

export async function readUtilityDocument(base64: string, mediaType: MediaType): Promise<Result> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { error: "Non autenticato." };
  const userId = claims.claims.sub as string;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
  const plan = await getEffectivePlan(profile?.plan ?? "free", profile?.trial_ends_at);
  if (!isPremium(plan)) return { error: "Leggere bollette e contratti con l'AI è una funzione Premium." };

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    console.error("[bolletta] ANTHROPIC_API_KEY mancante o in formato inatteso");
    return { error: "La lettura delle bollette non è attiva in questo momento. Puoi inserire i dati a mano." };
  }
  if (!base64 || base64.length > MAX_BASE64_CHARS) {
    return { error: "Il file è troppo grande (massimo 3 MB). Prova con una foto della pagina con i prezzi." };
  }
  if (await overDailyLimit(userId)) {
    return { error: `Hai raggiunto il limite di ${DAILY_LIMIT} letture nelle ultime 24 ore. Riprova domani.` };
  }

  const file = mediaType === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: base64 } };

  let raw = "";
  try {
    const response = await new Anthropic({ apiKey }).messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: [file, { type: "text", text: buildBillPrompt(todayISO()) }] }],
    });
    raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[bolletta] errore API Anthropic:", detail);
    if (err instanceof Anthropic.APIError) {
      if (err.status === 429) return { error: "Troppe richieste in questo momento. Riprova tra un minuto." };
      if (err.status === 400) return { error: "Non riesco ad aprire questo file. Usa un PDF o una foto JPG/PNG." };
    }
    return { error: "La lettura non è riuscita. Riprova tra poco, o inserisci i dati a mano." };
  }

  const supplies = parseBillExtraction(raw);
  if (supplies.length === 0) {
    console.error("[bolletta] niente di leggibile; risposta:", raw.slice(0, 300));
    return { error: "Non ho trovato dati di luce o gas in questo file. Controlla che sia una bolletta o un contratto." };
  }
  return { supplies };
}
