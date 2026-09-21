"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackThrottled } from "@/lib/track";

const HOUR = 60 * 60 * 1000;

/**
 * Registra "app_open" (max 1 ogni 6 ore) e "page_view" (max 1 ogni 30 minuti per pagina).
 * `last_sign_in_at` di Supabase non si aggiorna finché la sessione resta valida, quindi
 * senza questo non si può sapere chi torna davvero nell'app.
 */
export function ActivityPing() {
  const path = usePathname();
  useEffect(() => {
    trackThrottled("app_open", { path }, 6 * HOUR);
    trackThrottled("page_view", { path }, HOUR / 2, `page_view:${path}`);
  }, [path]);
  return null;
}
