"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin-emails";

/**
 * Admin → Coupon: elimina un codice, anche se già usato. Chi l'ha usato tiene piano o giorni
 * di Premium; con il codice se ne vanno anche le righe di coupon_redemptions (cascade, migration 046).
 */
export async function deleteCoupon(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isAdminEmail(data?.claims?.email as string | undefined)) return { error: "Non autorizzato." };

  const { error } = await createServiceClient().from("coupon_codes").delete().eq("id", id);
  return error ? { error: error.message } : {};
}
