// Il giro del lunedì: email e notifica push. Lo chiama Vercel Cron (vercel.json) il lunedì mattina,
// solo in produzione, con l'intestazione Authorization: Bearer CRON_SECRET (Vercel la aggiunge da
// sola se la variabile CRON_SECRET esiste). Senza CRON_SECRET non parte niente.
// Le notifiche stanno qui e non in un cron loro perché il piano di Vercel ne permette solo due.
// I due giri sono indipendenti: se uno si ferma l'altro parte lo stesso.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runWeeklyEmails } from "@/lib/weekly-email-server";
import { runWeeklyPushes } from "@/lib/push-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();
  const [email, push] = await Promise.allSettled([runWeeklyEmails(service), runWeeklyPushes(service)]);
  const out = {
    email: email.status === "fulfilled" ? email.value : { error: "failed" },
    push: push.status === "fulfilled" ? push.value : { error: "failed" },
  };
  // solo conteggi: niente indirizzi né importi nei log
  if (email.status === "rejected") console.error("email del lunedì: giro fermo", email.reason instanceof Error ? email.reason.message : "errore");
  if (push.status === "rejected") console.error("notifica del lunedì: giro fermo", push.reason instanceof Error ? push.reason.message : "errore");
  console.log("giro del lunedì", JSON.stringify(out));
  return NextResponse.json(out, { status: email.status === "rejected" && push.status === "rejected" ? 500 : 200 });
}
