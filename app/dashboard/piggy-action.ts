"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePiggyBalance(formData: FormData) {
  const raw = formData.get("piggy_balance") as string;
  const piggy_balance = parseFloat(raw.replace(",", "."));
  if (isNaN(piggy_balance)) return { error: "Importo non valido." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("profiles")
    .update({ piggy_balance })
    .eq("id", data.claims.sub);

  if (error) {
    console.error("[piggy-action]", error);
    return { error: `Errore: ${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
