import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plans";
import crypto from "crypto";

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

function generateCode(): string {
  // Format: FLUSSO-XXXX-XXXX  (uppercase alphanumeric, easy to type)
  const segment = () => crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
  return `FLUSSO-${segment()}-${segment()}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  if (!getAdminEmails().includes(data.claims.email as string)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const plan = body?.plan as Plan | undefined;
  const notes = (body?.notes as string | undefined) ?? null;
  const customCode = (body?.code as string | undefined)?.trim().toUpperCase() || null;
  // Migration 046: giorni di Premium (vuoto = per sempre) e quante persone possono usarlo
  const days = body?.days ? Math.round(Number(body.days)) : null;
  const maxUses = body?.max_uses ? Math.round(Number(body.max_uses)) : 1;

  if (!plan || !["premium", "founder"].includes(plan)) {
    return NextResponse.json({ error: "Piano non valido (premium o founder)" }, { status: 400 });
  }

  if (days !== null && (!Number.isFinite(days) || days < 1 || days > 730)) {
    return NextResponse.json({ error: "Giorni non validi (da 1 a 730)" }, { status: 400 });
  }
  if (days !== null && plan !== "premium") {
    return NextResponse.json({ error: "I giorni valgono solo per Premium" }, { status: 400 });
  }
  if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 1000) {
    return NextResponse.json({ error: "Numero di persone non valido (da 1 a 1000)" }, { status: 400 });
  }

  const code = customCode ?? generateCode();
  const service = getServiceClient();

  const { data: coupon, error } = await service
    .from("coupon_codes")
    .insert({ code, plan, notes, days, max_uses: maxUses })
    .select("id, code, plan, used, used_by, used_at, notes, created_at, days, max_uses, uses")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Codice già esistente" }, { status: 409 });
    }
    console.error("[admin/create-coupon]", error);
    return NextResponse.json({ error: "Errore nella creazione" }, { status: 500 });
  }

  return NextResponse.json({ coupon });
}
