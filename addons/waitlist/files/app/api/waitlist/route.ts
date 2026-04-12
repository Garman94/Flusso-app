import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json();

    if (!email?.trim()) {
      return NextResponse.json(
        { error: "L'email è obbligatoria." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Indirizzo email non valido." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("waitlist")
      .insert({ email: email.toLowerCase().trim(), name: name?.trim() || null });

    if (error) {
      if (error.code === "23505") {
        // Duplicate — treat as success so we don't leak whether email exists
        return NextResponse.json({ success: true });
      }
      throw error;
    }

    // Send confirmation email
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: "Sei in lista d'attesa!",
      html: `
        <h2>${name ? `Ciao ${name}!` : "Ciao!"}</h2>
        <p>Hai richiesto l'accesso anticipato. Ti contatteremo non appena sarà disponibile.</p>
        <p>Grazie per l'interesse!</p>
        <p style="color: #888; font-size: 12px;">Se non hai fatto questa richiesta, ignora questa email.</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Waitlist error:", error);
    return NextResponse.json(
      { error: "Errore interno. Riprova più tardi." },
      { status: 500 }
    );
  }
}
