"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEffectivePlan } from "@/lib/preview-plan";
import { isPremium } from "@/lib/plans";
import { todayISO } from "@/lib/dates";
import {
  buildPrompt, buildStatementPrompt, checkStatement, parseExtraction, parseStatementExtraction,
  type ExtractedTransaction, type StatementBalances, type StatementCheck,
} from "@/lib/screenshot-extract";

// Un file "use server" non può ri-esportare nulla, nemmeno i tipi (Next li tratta come export a runtime):
// chi ha bisogno del tipo lo importa da @/lib/screenshot-extract.

/** Analisi per utente nelle ultime 24 ore (screenshot e PDF insieme): ogni chiamata costa, meglio un tetto. */
const DAILY_LIMIT = 20;
/** ~4 MB di immagine in base64: il client la riduce prima, questo è solo un paracadute. */
const MAX_BASE64_CHARS = 5_500_000;
/** PDF: il limite delle server action è 4 MB (next.config), quindi un file fino a ~2,9 MB. */
const MAX_PDF_BASE64_CHARS = 3_900_000;

type Result = { transactions?: ExtractedTransaction[]; warning?: string; error?: string };
type PdfResult = Result & { balances?: StatementBalances; check?: StatementCheck | null };

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

const NOT_ACTIVE = "La lettura con l'AI non è ancora attiva. Nel frattempo puoi caricare un file Excel o CSV.";

/** Controlli comuni a screenshot e PDF: login, Premium, chiave dell'API. Il limite giornaliero lo conta chi chiama. */
async function guard(): Promise<{ userId: string; apiKey: string } | { error: string }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { error: "Non autenticato." };
  const userId = claims.claims.sub as string;

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", userId).single();
  const plan = await getEffectivePlan(profile?.plan ?? "free", profile?.trial_ends_at);
  if (!isPremium(plan)) return { error: "L'import da foto e PDF è una funzione Premium." };

  // .trim(): uno spazio o un a-capo rimasti da un copia-incolla nel pannello di Vercel
  // basta a rompere l'autenticazione senza che si veda nulla di strano guardando il valore.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    // Configurazione mancante: il dettaglio va nei log, all'utente un messaggio comprensibile
    console.error("[screenshot] ANTHROPIC_API_KEY non configurata: lettura con l'AI non disponibile");
    return { error: NOT_ACTIVE };
  }
  if (!apiKey.startsWith("sk-ant-")) {
    console.error("[screenshot] ANTHROPIC_API_KEY presente ma con un formato inatteso (non inizia con sk-ant-)");
    return { error: NOT_ACTIVE };
  }
  return { userId, apiKey };
}

/** Errore dell'API → messaggio per l'utente. */
function apiErrorText(err: unknown, what: "immagine" | "PDF"): string {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[screenshot] errore API Anthropic (${what}):`, detail);
  const UNAVAILABLE = "Il servizio di analisi è momentaneamente non disponibile. Riprova più tardi, o carica il file Excel/CSV nel frattempo.";
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401 || err.status === 403 || /credit/i.test(detail)) return UNAVAILABLE;
    if (err.status === 429) return "Troppe richieste in questo momento. Riprova tra un minuto.";
    if (err.status === 400) return what === "PDF"
      ? "Non riesco a leggere questo PDF. Prova con l'estratto conto scaricato dalla banca (non una foto stampata)."
      : "Non riesco a leggere questa immagine. Usa uno screenshot PNG o JPG.";
  }
  return "L'analisi non è riuscita. Riprova tra poco.";
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export async function extractTransactionsFromScreenshot(
  base64Image: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<Result> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  if (!base64Image || base64Image.length > MAX_BASE64_CHARS) {
    return { error: "L'immagine è troppo grande. Prova con uno screenshot più piccolo." };
  }
  if (await overDailyLimit(g.userId)) {
    return { error: `Hai raggiunto il limite di ${DAILY_LIMIT} analisi nelle ultime 24 ore. Riprova domani.` };
  }

  const client = new Anthropic({ apiKey: g.apiKey });
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
    raw = textOf(response);
  } catch (err) {
    return { error: apiErrorText(err, "immagine") };
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

/**
 * Estratto conto PDF (qualsiasi banca): movimenti e saldi del periodo. Con saldo iniziale e
 * finale si controlla che la lettura non abbia saltato righe (checkStatement).
 */
export async function extractTransactionsFromPdf(base64Pdf: string): Promise<PdfResult> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  if (!base64Pdf || base64Pdf.length > MAX_PDF_BASE64_CHARS) {
    return { error: "Il PDF è troppo grande (massimo circa 3 MB). Scarica un periodo più corto, per esempio un mese." };
  }
  if (await overDailyLimit(g.userId)) {
    return { error: `Hai raggiunto il limite di ${DAILY_LIMIT} analisi nelle ultime 24 ore. Riprova domani.` };
  }

  const client = new Anthropic({ apiKey: g.apiKey });
  const today = todayISO();

  let raw = "";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Pdf } },
            { type: "text", text: buildStatementPrompt(today) },
          ],
        },
      ],
    });
    raw = textOf(response);
  } catch (err) {
    return { error: apiErrorText(err, "PDF") };
  }

  const { transactions, truncated, dropped, balances } = parseStatementExtraction(raw, today);
  if (transactions.length === 0) {
    console.error("[screenshot] PDF senza movimenti leggibili; risposta:", raw.slice(0, 300));
    return { error: "Non ho trovato movimenti in questo PDF. Controlla che sia un estratto conto o una lista movimenti." };
  }

  const notes: string[] = [];
  if (truncated) notes.push("L'estratto conto era molto lungo: ho letto solo una parte dei movimenti. Prova con un periodo più corto.");
  if (dropped > 0) notes.push(`${dropped} righe senza data o importo leggibili sono state ignorate.`);
  return {
    transactions, balances, check: checkStatement(balances, transactions),
    warning: notes.length ? notes.join(" ") : undefined,
  };
}
