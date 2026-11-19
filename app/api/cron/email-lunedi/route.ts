// Il giro dell'email del lunedì. Lo chiama Vercel Cron (vercel.json) il lunedì mattina, solo
// in produzione, con l'intestazione Authorization: Bearer CRON_SECRET (Vercel la aggiunge da
// sola se la variabile CRON_SECRET esiste). Senza CRON_SECRET non parte niente.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runWeeklyEmails } from "@/lib/weekly-email-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runWeeklyEmails(createServiceClient());
    // solo conteggi: niente indirizzi né importi nei log
    console.log("email del lunedì", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    console.error("email del lunedì: giro fermo", err instanceof Error ? err.message : "errore");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
