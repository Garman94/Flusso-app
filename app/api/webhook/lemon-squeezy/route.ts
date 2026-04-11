import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Lemon Squeezy event types we care about
type LemonSqueezyEvent =
  | "order_created"
  | "subscription_created"
  | "subscription_cancelled"
  | string;

interface LemonSqueezyWebhookPayload {
  meta: {
    event_name: LemonSqueezyEvent;
    custom_data?: {
      user_id?: string;
    };
  };
  data: {
    attributes: {
      user_email?: string;
      // subscription attributes
      customer_email?: string;
      status?: string;
    };
  };
}

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("LEMON_SQUEEZY_WEBHOOK_SECRET is not set");
    return false;
  }
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(body).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(digest, "hex"),
    Buffer.from(signature, "hex"),
  );
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set",
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
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

  // We need a user_id in custom_data to know which profile to update.
  // Pass it when creating the checkout link in your frontend.
  if (!userId) {
    console.warn(`[lemon-squeezy] No user_id in custom_data for ${eventName}`);
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceClient();

  if (eventName === "order_created" || eventName === "subscription_created") {
    const { error } = await supabase
      .from("profiles")
      .update({ plan: "premium" })
      .eq("id", userId);

    if (error) {
      console.error(`[lemon-squeezy] Failed to upgrade plan for ${userId}:`, error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    console.log(`[lemon-squeezy] Upgraded ${userId} to premium (${eventName})`);
  } else if (eventName === "subscription_cancelled") {
    const { error } = await supabase
      .from("profiles")
      .update({ plan: "free" })
      .eq("id", userId);

    if (error) {
      console.error(`[lemon-squeezy] Failed to downgrade plan for ${userId}:`, error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    console.log(`[lemon-squeezy] Downgraded ${userId} to free (subscription_cancelled)`);
  }

  return NextResponse.json({ received: true });
}
