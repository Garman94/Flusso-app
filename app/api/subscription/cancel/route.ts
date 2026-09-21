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

  // Lemon Squeezy tiene l'abbonamento attivo fino a fine periodo: il piano resta Premium
  // e torna Gratuito quando arriva subscription_expired (webhook). Qui salviamo solo
  // la data di fine per mostrarla all'utente.
  let endsAt: string | null = null;
  try {
    const json = await lsResponse.json();
    endsAt = json?.data?.attributes?.ends_at ?? null;
  } catch {
    // risposta senza corpo: non è un errore
  }

  const { error: updateError } = await service
    .from("profiles")
    .update({ premium_ends_at: endsAt })
    .eq("id", userId);

  if (updateError) {
    // Colonna assente (migration 036 non ancora applicata) o errore DB: l'annullamento
    // su Lemon Squeezy è comunque riuscito, quindi non lo trattiamo come fallimento.
    console.error("[subscription/cancel] premium_ends_at non salvata:", updateError.message);
  }

  return NextResponse.json({ plan: "premium", endsAt });
}
