"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePayDay(payDay: number) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("profiles")
    .update({ pay_day: payDay })
    .eq("id", data.claims.sub);

  if (error) {
    console.error("[pay-day-action]", error);
    return { error: `Errore: ${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
