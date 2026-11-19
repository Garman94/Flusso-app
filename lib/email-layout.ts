// Cornice delle email di Flusso (benvenuto, password, email del lunedì). Funzioni pure,
// senza Resend: si possono provare nei test. Stili in linea perché i programmi di posta
// ignorano i fogli di stile.
import { siteConfig } from "./config";

/** Testo dell'utente dentro l'HTML (nomi, spese): mai tag o attributi. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * `preheader`: la riga grigia che i programmi di posta mostrano accanto all'oggetto (nascosta nel testo).
 * `footerExtra`: HTML già pulito da aggiungere in fondo (es. il link per disiscriversi).
 */
export function emailLayout(content: string, opts: { preheader?: string; footerExtra?: string } = {}): string {
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${siteConfig.name}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  ${pre}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
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
            <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;line-height:1.6;">
              ${opts.footerExtra ? `${opts.footerExtra}<br />` : ""}
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

/** Pulsante scuro, lo stesso delle altre email. `href` deve essere già un link sicuro. */
export function emailButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}"
       style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
      ${escapeHtml(label)}
    </a>`;
}
