"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackThrottled } from "@/lib/track";

const HOUR = 60 * 60 * 1000;

/**
 * Registra "app_open" (max 1 ogni 6 ore), "page_view" (max 1 ogni 30 minuti per pagina),
 * "email_clicked" quando si arriva da un link di un'email e "push_clicked" da una notifica.
 * `last_sign_in_at` di Supabase non si aggiorna finché la sessione resta valida, quindi
 * senza questo non si può sapere chi torna davvero nell'app.
 */
export function ActivityPing() {
  const path = usePathname();
  useEffect(() => {
    trackThrottled("app_open", { path }, 6 * HOUR);
    trackThrottled("page_view", { path }, HOUR / 2, `page_view:${path}`);
    // Clic da un'email o da una notifica (link con ?da=email-… o ?da=push-…): quante persone
    // tornano grazie a email e notifiche. Al massimo uno all'ora per tipo, così ricaricare la
    // pagina non lo conta due volte.
    try {
      const from = new URLSearchParams(window.location.search).get("da");
      const m = from?.match(/^(email|push)-[a-z-]{1,30}$/);
      if (from && m) {
        const name = m[1] === "push" ? "push_clicked" : "email_clicked";
        trackThrottled(name, { kind: from, path }, HOUR, `${name}:${from}`);
      }
    } catch {
      // le metriche non devono mai rompere l'app
    }
  }, [path]);
  return null;
}
