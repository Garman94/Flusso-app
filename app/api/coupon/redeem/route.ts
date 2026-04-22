import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  // Authenticate user
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  const userId = data.claims.sub as string;

  const body = await request.json().catch(() => null);
  const code = (body?.code as string | undefined)?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Codice coupon mancante" }, { status: 400 });
  }

  const service = getServiceClient();

  // Fetch coupon (case-insensitive match via stored uppercase)
  const { data: coupon, error: fetchError } = await service
    .from("coupon_codes")
    .select("id, plan, used, used_by")
    .eq("code", code)
    .maybeSingle();

  if (fetchError) {
    console.error("[coupon/redeem] fetch error:", fetchError);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
  if (!coupon) {
    return NextResponse.json({ error: "Coupon non valido" }, { status: 404 });
  }
  if (coupon.used) {
    return NextResponse.json({ error: "Questo coupon è già stato utilizzato" }, { status: 409 });
  }

  // Check user already has same or better plan
  const { data: profile } = await service
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  if (profile?.plan === "founder") {
    return NextResponse.json({ error: "Hai già il piano Founder" }, { status: 409 });
  }
  if (profile?.plan === "premium" && coupon.plan === "premium") {
    return NextResponse.json({ error: "Hai già il piano Premium" }, { status: 409 });
  }

  // Mark coupon as used and upgrade plan in a single transaction-like sequence
  const { error: markError } = await service
    .from("coupon_codes")
    .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
    .eq("id", coupon.id)
    .eq("used", false); // guard against race condition

  if (markError) {
    console.error("[coupon/redeem] mark error:", markError);
    return NextResponse.json({ error: "Errore nel riscatto del coupon" }, { status: 500 });
  }

  const { error: planError } = await service
    .from("profiles")
    .update({ plan: coupon.plan })
    .eq("id", userId);

  if (planError) {
    console.error("[coupon/redeem] plan update error:", planError);
    // Roll back coupon mark — best effort
    await service
      .from("coupon_codes")
      .update({ used: false, used_by: null, used_at: null })
      .eq("id", coupon.id);
    return NextResponse.json({ error: "Errore nell'aggiornamento del piano" }, { status: 500 });
  }

  return NextResponse.json({ plan: coupon.plan });
}
