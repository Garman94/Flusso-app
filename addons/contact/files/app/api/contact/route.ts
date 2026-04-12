import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { name, email, message } = await request.json();

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: "Tutti i campi sono obbligatori." },
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

    if (message.trim().length > 2000) {
      return NextResponse.json(
        { error: "Il messaggio non può superare i 2000 caratteri." },
        { status: 400 }
      );
    }

    const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim();
    if (!adminEmail) {
      return NextResponse.json(
        { error: "Configurazione server mancante." },
        { status: 500 }
      );
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message);

    // Send notification to admin
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: adminEmail,
      subject: `Nuovo messaggio da ${safeName}`,
      html: `
        <h2>Nuovo messaggio di contatto</h2>
        <p><strong>Nome:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Messaggio:</strong></p>
        <p style="white-space: pre-wrap; background: #f4f4f4; padding: 12px; border-radius: 6px;">${safeMessage}</p>
        <hr />
        <p style="color: #888; font-size: 12px;">Inviato tramite il modulo di contatto del sito.</p>
      `,
    });

    // Send confirmation to user
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: "Abbiamo ricevuto il tuo messaggio",
      html: `
        <h2>Grazie, ${safeName}!</h2>
        <p>Abbiamo ricevuto il tuo messaggio e ti risponderemo al più presto.</p>
        <p style="color: #888; font-size: 12px;">Se non hai inviato questo messaggio, ignora questa email.</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Errore interno. Riprova più tardi." },
      { status: 500 }
    );
  }
}
