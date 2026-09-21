import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

// Eventi Lemon Squeezy gestiti:
//   order_created / subscription_created / subscription_resumed → piano Premium
//   subscription_cancelled → NON declassa: l'utente ha già pagato il periodo in corso.
//                            Si salva solo la fine del periodo (ends_at).
//   subscription_expired / order_refunded → torna Gratuito
// Il piano Founder (a vita) non viene mai toccato dal webhook.
type LemonSqueezyEvent = string;

interface LemonSqueezyWebhookPayload {
  meta: {
    event_name: LemonSqueezyEvent;
    custom_data?: {
      user_id?: string;
    };
  };
  data: {
    id: string;
    attributes: {
      user_email?: string;
      customer_email?: string;
      status?: string;
      ends_at?: string | null;
    };
  };
}

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[lemon-squeezy] LEMON_SQUEEZY_WEBHOOK_SECRET is not set");
    return false;
  }
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

type ProfilePatch = {
  plan?: string;
  lemon_squeezy_subscription_id?: string | null;
  premium_ends_at?: string | null;
};

/**
 * Aggiorna il profilo senza mai toccare un Founder. `premium_ends_at` esiste solo dopo
 * la migration 036: se manca, si ripete l'aggiornamento senza quella colonna.
 */
async function updateProfile(userId: string, patch: ProfilePatch) {
  const supabase = createServiceClient();
  const run = (p: ProfilePatch) =>
    supabase.from("profiles").update(p).eq("id", userId).neq("plan", "founder");

  let { error } = await run(patch);
  if (error && "premium_ends_at" in patch && error.message.includes("premium_ends_at")) {
    const { premium_ends_at: _omit, ...rest } = patch;
    void _omit;
    ({ error } = await run(rest));
  }
  return error;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? "";

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: LemonSqueezyWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventName = payload.meta.event_name;
  const userId = payload.meta.custom_data?.user_id;

  // Serve lo user_id in custom_data per sapere quale profilo aggiornare: lo aggiunge
  // il pulsante "Passa a Premium" in Account. Un checkout aperto da un link diretto
  // arriva senza, e il pagamento non si collega a nessun utente: lo segnaliamo.
  if (!userId) {
    console.error(`[lemon-squeezy] PAGAMENTO NON COLLEGABILE: ${eventName} senza user_id in custom_data (${payload.data?.attributes?.user_email ?? "email sconosciuta"})`);
    return NextResponse.json({ received: true });
  }

  let error: { message: string } | null = null;

  if (eventName === "order_created" || eventName === "subscription_created" || eventName === "subscription_resumed") {
    const patch: ProfilePatch = { plan: "premium", premium_ends_at: null };
    if (eventName === "subscription_created") patch.lemon_squeezy_subscription_id = payload.data.id;
    error = await updateProfile(userId, patch);
    if (!error) console.log(`[lemon-squeezy] ${userId} → premium (${eventName})`);
  } else if (eventName === "subscription_cancelled") {
    error = await updateProfile(userId, { premium_ends_at: payload.data.attributes.ends_at ?? null });
    if (!error) console.log(`[lemon-squeezy] ${userId} ha annullato: Premium fino a ${payload.data.attributes.ends_at ?? "fine periodo"}`);
  } else if (eventName === "subscription_expired" || eventName === "order_refunded") {
    error = await updateProfile(userId, { plan: "free", lemon_squeezy_subscription_id: null, premium_ends_at: null });
    if (!error) console.log(`[lemon-squeezy] ${userId} → free (${eventName})`);
  }

  if (error) {
    console.error(`[lemon-squeezy] Aggiornamento profilo fallito per ${userId} (${eventName}):`, error);
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
