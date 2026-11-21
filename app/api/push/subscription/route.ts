// Quando il browser cambia da solo l'indirizzo delle notifiche (evento pushsubscriptionchange nel
// service worker, soprattutto Firefox), il service worker manda qui quello nuovo e quello vecchio.
// Serve la sessione: il service worker manda i cookie del sito.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isDemoEmail } from "@/lib/demo";
import { isPushEndpoint, parseSubscription } from "@/lib/push";
import { pushConfigured, storeSubscription } from "@/lib/push-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origin" }, { status: 403 });
  if (!pushConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || isDemoEmail(data.claims.email as string | undefined)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { subscription?: unknown; old?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const sub = parseSubscription(body.subscription);
  if (!sub) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const old = typeof body.old === "string" && isPushEndpoint(body.old) ? body.old : undefined;

  try {
    await storeSubscription(createServiceClient(), userId, sub, null, old);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
