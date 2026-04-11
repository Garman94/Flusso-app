/**
 * Email utilities using Resend.
 * Server-side only — never import in client components.
 */
import { Resend } from "resend";
import { siteConfig } from "@/lib/config";

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
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${siteConfig.name}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:20px;font-weight:700;color:#111827;">${siteConfig.name}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;">
              © ${new Date().getFullYear()} ${siteConfig.name} — <a href="${siteConfig.url}/privacy" style="color:#6b7280;">Privacy Policy</a> · <a href="${siteConfig.url}/terms" style="color:#6b7280;">Termini</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
