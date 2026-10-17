import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

// Risposte di redeem_coupon (migration 046) → messaggio e stato HTTP
const ERRORS: Record<string, [string, number]> = {
  not_found: ["Coupon non valido", 404],
  used: ["Questo coupon è già stato utilizzato", 409],
  sold_out: ["I posti per questo codice sono finiti", 409],
  already_redeemed: ["Hai già usato questo codice", 409],
  already_founder: ["Hai già il piano Founder", 409],
  already_premium: ["Hai già il piano Premium", 409],
  no_profile: ["Profilo non trovato", 404],
};

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

  // Tutto il riscatto in una funzione del database: controlli, posti, una volta a testa, piano o giorni di Premium
  const { data: result, error } = await getServiceClient().rpc("redeem_coupon", { p_code: code, p_user: userId });
  if (error) {
    console.error("[coupon/redeem]", error);
    return NextResponse.json({ error: "Errore nel riscatto del coupon" }, { status: 500 });
  }

  const r = (result ?? {}) as { error?: string; plan?: string; days?: number; until?: string };
  if (r.error) {
    const [message, status] = ERRORS[r.error] ?? ["Coupon non valido", 400];
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ plan: r.plan, days: r.days ?? null, until: r.until ?? null });
}
