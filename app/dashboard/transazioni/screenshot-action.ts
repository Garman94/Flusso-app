"use server";

import Anthropic from "@anthropic-ai/sdk";

export type ExtractedTransaction = {
  date: string;       // YYYY-MM-DD
  amount: number;     // negativo = uscita, positivo = entrata
  description: string;
};

export async function extractTransactionsFromScreenshot(
  base64Image: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<{ transactions?: ExtractedTransaction[]; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY non configurata nel server." };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let raw = "";
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Image },
            },
            {
              type: "text",
              text: `Analizza questo screenshot di un estratto conto o lista di transazioni bancarie.
Estrai TUTTE le transazioni visibili.

Per ogni transazione restituisci:
- date: data in formato YYYY-MM-DD (se l'anno non è visibile usa l'anno corrente)
- amount: importo numerico (negativo per uscite/addebiti/pagamenti, positivo per entrate/accrediti/bonifici ricevuti)
- description: descrizione breve del movimento (max 80 caratteri)

Restituisci SOLO un array JSON valido, senza markdown, senza testo prima o dopo.
Esempio: [{"date":"2024-03-15","amount":-25.50,"description":"Esselunga"},{"date":"2024-03-14","amount":1500,"description":"Stipendio"}]`,
            },
          ],
        },
      ],
    });

    raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Rimuovi eventuali backtick markdown
    const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    const transactions: ExtractedTransaction[] = JSON.parse(cleaned);

    // Validazione base
    const valid = transactions.filter(
      (t) =>
        typeof t.date === "string" &&
        typeof t.amount === "number" &&
        typeof t.description === "string",
    );

    return { transactions: valid };
  } catch (err) {
    return { error: `Impossibile estrarre le transazioni: ${raw || String(err)}` };
  }
}
