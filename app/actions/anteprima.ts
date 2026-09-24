"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_URL } from "@/lib/anteprima";

/**
 * Link per entrare nell'anteprima con il proprio account, solo per gli admin. L'anteprima
 * sta su un altro indirizzo, quindi la sessione del sito non vale lì, e l'accesso con Google
 * riporterebbe al sito pubblicato: si crea un accesso monouso (come i link via email, ma
 * senza email) che la pagina /auth/confirm dell'anteprima verifica.
 */
export async function previewLoginUrl(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
  if (!email || !admins.includes(email)) return { error: "Non autorizzato." };

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: link, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const token = link?.properties?.hashed_token;
  if (error || !token) return { error: `Non riesco a creare l'accesso: ${error?.message ?? "risposta vuota"}` };

  const params = new URLSearchParams({
    token_hash: token,
    type: link.properties.verification_type ?? "magiclink",
    next: "/dashboard",
  });
  // Con "Protection Bypass for Automation" attivo su Vercel si salta anche il login di Vercel.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    params.set("x-vercel-protection-bypass", bypass);
    params.set("x-vercel-set-bypass-cookie", "true");
  }
  return { url: `${PREVIEW_URL}/auth/confirm?${params}` };
}
