import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  const userId = data.claims.sub as string;

  const { error } = await supabase
    .from("excel_uploads")
    .insert({ user_id: userId });

  if (error) {
    console.error("[excel/log-upload]", error);
    return NextResponse.json({ error: "Errore nel log" }, { status: 500 });
  }

  return NextResponse.json({ logged: true });
}
