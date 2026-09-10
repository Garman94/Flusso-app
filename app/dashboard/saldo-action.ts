"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateStartingBalance(formData: FormData) {
  const raw = formData.get("starting_balance") as string;
  const startDate = formData.get("start_date") as string;
  const amount = parseFloat(raw.replace(",", "."));
  if (isNaN(amount)) return { error: "Importo non valido." };
  if (!startDate) return { error: "Data non valida." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("profiles")
    .update({ period_starting_balance: amount, period_starting_balance_date: startDate })
    .eq("id", data.claims.sub);

  if (error) {
    console.error("[saldo-action]", error);
    return { error: `Errore: ${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
