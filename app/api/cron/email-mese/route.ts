// Il giro dell'email del mese. Lo chiama Vercel Cron (vercel.json) ogni giorno nel tardo
// pomeriggio, solo in produzione, con l'intestazione Authorization: Bearer CRON_SECRET (Vercel la
// aggiunge da sola se la variabile CRON_SECRET esiste). Senza CRON_SECRET non parte niente.
// Ogni giorno, perché ognuno ha il suo giorno di stipendio: l'email parte nei primi giorni del
// periodo nuovo, una volta sola (lib/monthly-email-server.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runMonthlyEmails } from "@/lib/monthly-email-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runMonthlyEmails(createServiceClient());
    // solo conteggi: niente indirizzi né importi nei log
    console.log("email del mese", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    console.error("email del mese: giro fermo", err instanceof Error ? err.message : "errore");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
