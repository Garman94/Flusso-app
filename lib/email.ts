/**
 * Email utilities using Resend.
 * Server-side only — never import in client components.
 */
import { Resend } from "resend";
import { siteConfig } from "@/lib/config";
import { emailLayout } from "@/lib/email-layout";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return new Resend(apiKey);
}

const FROM = process.env.RESEND_FROM_EMAIL ?? `noreply@${new URL(siteConfig.url).hostname}`;

export async function sendWelcomeEmail(to: string, name?: string) {
  const resend = getResendClient();
  const displayName = name || to.split("@")[0];

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Benvenuto su ${siteConfig.name}!`,
    html: welcomeEmailHtml(displayName),
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const resend = getResendClient();

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Reimposta la tua password — ${siteConfig.name}`,
    html: passwordResetEmailHtml(resetUrl),
  });
}

// ─── Email templates ───────────────────────────────────────────────────────

function emailWrapper(content: string) {
  return emailLayout(content);
}

function welcomeEmailHtml(name: string) {
  return emailWrapper(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Benvenuto, ${name}! 👋</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      Il tuo account su <strong>${siteConfig.name}</strong> è stato creato con successo.
      Sei pronto per iniziare.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
      Clicca il pulsante qui sotto per accedere alla tua dashboard.
    </p>
    <a href="${siteConfig.url}/dashboard"
       style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
      Vai alla dashboard →
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
      Se non hai creato questo account, ignora questa email.
    </p>
  `);
}

function passwordResetEmailHtml(resetUrl: string) {
  return emailWrapper(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Reimposta la password</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      Abbiamo ricevuto una richiesta per reimpostare la password del tuo account.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
      Clicca il pulsante qui sotto per scegliere una nuova password. Il link scade tra 1 ora.
    </p>
    <a href="${resetUrl}"
       style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
      Reimposta password →
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
      Se non hai richiesto il reset, ignora questa email. La tua password non cambierà.
    </p>
  `);
}
