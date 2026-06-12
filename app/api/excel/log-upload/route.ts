import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/preview-plan";
import { isPremium } from "@/lib/plans";

const EXCEL_FREE_LIMIT = 3;

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  const userId = data.claims.sub as string;

  const { data: profile } = await supabase
    .from("profiles").select("plan").eq("id", userId).single();
  const plan = await getEffectivePlan(profile?.plan ?? "free");

  if (!isPremium(plan)) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("excel_uploads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("uploaded_at", monthStart.toISOString());

    if ((count ?? 0) >= EXCEL_FREE_LIMIT) {
      return NextResponse.json(
        { error: `Hai raggiunto il limite di ${EXCEL_FREE_LIMIT} import Excel al mese per il piano gratuito.`, limitReached: true },
        { status: 403 },
      );
    }
  }

  const { error } = await supabase
    .from("excel_uploads")
    .insert({ user_id: userId });

  if (error) {
    console.error("[excel/log-upload]", error);
    return NextResponse.json({ error: "Errore nel log" }, { status: 500 });
  }

  return NextResponse.json({ logged: true });
}
