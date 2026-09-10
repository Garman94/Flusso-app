"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { IncomeInfo } from "@/lib/calculations";

export async function updateOwnerIncome(info: IncomeInfo) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("profiles")
    .update({
      income_type: info.income_type,
      monthly_income: info.monthly_income,
      income_frequency: info.income_frequency,
      income_payday: info.income_payday,
      income_variability: info.income_variability,
      active_months: info.active_months ?? [],
    })
    .eq("id", data.claims.sub);

  if (error) {
    console.error("[income-action]", error);
    return { error: `Errore: ${error.message}` };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  return { success: true };
}
