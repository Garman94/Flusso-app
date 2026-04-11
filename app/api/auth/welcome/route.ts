import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email";

/**
 * Sends a welcome email to a newly registered user.
 * Can be called:
 *   - Client-side after sign-up (authenticated, no secret needed)
 *   - Server-side webhooks (with x-webhook-secret header)
 */
export async function POST(request: NextRequest) {
  let userId: string | undefined;
  let email: string | undefined;

  // Check if called with internal webhook secret (e.g. from Supabase webhook)
  const secret = request.headers.get("x-webhook-secret");
  if (secret) {
    if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    userId = body.user_id;
    email = body.email;
  } else {
    // Called from the client — verify the user is authenticated
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = data.claims.sub;
    email = data.claims.email as string;
  }

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  // Fetch full_name from profiles if available
  let fullName: string | undefined;
  if (userId) {
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data } = await service
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    fullName = data?.full_name ?? undefined;
  }

  await sendWelcomeEmail(email, fullName);

  return NextResponse.json({ sent: true });
}
