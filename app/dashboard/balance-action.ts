"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateBalance(formData: FormData) {
  const raw = formData.get("balance") as string;
  const balance = parseFloat(raw.replace(",", "."));
  if (isNaN(balance)) return { error: "Importo non valido." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("profiles")
    .update({ balance })
    .eq("id", data.claims.sub);

  if (error) {
    console.error("[balance-action]", error);
    return { error: `Errore: ${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
