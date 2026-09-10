import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  const userId = data.claims.sub as string;

  const service = getServiceClient();

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("plan, lemon_squeezy_subscription_id")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profilo non trovato" }, { status: 404 });
  }
  if (profile.plan !== "premium") {
    return NextResponse.json({ error: "Nessun abbonamento Premium attivo da annullare" }, { status: 409 });
  }
  if (!profile.lemon_squeezy_subscription_id) {
    return NextResponse.json(
      { error: "Nessun abbonamento collegato trovato. Contatta il supporto per assistenza." },
      { status: 409 }
    );
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  if (!apiKey) {
    console.error("[subscription/cancel] LEMON_SQUEEZY_API_KEY is not set");
    return NextResponse.json({ error: "Errore di configurazione. Contatta il supporto." }, { status: 500 });
  }

  const lsResponse = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions/${profile.lemon_squeezy_subscription_id}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!lsResponse.ok) {
    const body = await lsResponse.text().catch(() => "");
    console.error(`[subscription/cancel] Lemon Squeezy API error (${lsResponse.status}):`, body);
    return NextResponse.json({ error: "Errore durante l'annullamento. Riprova." }, { status: 502 });
  }

  // Downgrade immediately; the subsequent subscription_cancelled webhook is idempotent.
  const { error: updateError } = await service
    .from("profiles")
    .update({ plan: "free", lemon_squeezy_subscription_id: null })
    .eq("id", userId);

  if (updateError) {
    console.error("[subscription/cancel] Failed to downgrade plan after cancellation:", updateError);
    return NextResponse.json({ error: "Abbonamento annullato ma si è verificato un errore. Ricarica la pagina." }, { status: 500 });
  }

  return NextResponse.json({ plan: "free" });
}
