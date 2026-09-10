import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Ricarica i dati dell'account demo. Chiamato da /demo a ogni ingresso.
// Rumore-safe: senza service role key non fa nulla (204).
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return new NextResponse(null, { status: 204 });
  }

  const service = createServiceClient(url, key, { auth: { persistSession: false } });
  const { error } = await service.rpc("reseed_demo");

  if (error) {
    console.error("[demo/reset] reseed_demo failed:", error.message);
    return NextResponse.json({ error: "reset_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
