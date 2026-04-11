import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateUserPlan } from "@/lib/admin";
import type { Plan } from "@/lib/plans";

const VALID_PLANS: Plan[] = ["free", "premium", "founder"];

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(data.claims.email as string)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  let body: { userId?: string; plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }

  const { userId, plan } = body;
  if (!userId || !plan || !VALID_PLANS.includes(plan as Plan)) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  await updateUserPlan(userId, plan as Plan);

  return NextResponse.json({ updated: true });
}
