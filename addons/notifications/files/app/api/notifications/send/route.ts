import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-to-server route — requires SUPABASE_WEBHOOK_SECRET header
// Use this from your own backend code to send notifications to users

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  try {
    const { user_id, title, body } = await request.json();

    if (!user_id || !title) {
      return NextResponse.json(
        { error: "user_id e title sono obbligatori." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("notifications")
      .insert({ user_id, title, body: body ?? null });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send notification error:", error);
    return NextResponse.json({ error: "Errore interno." }, { status: 500 });
  }
}
