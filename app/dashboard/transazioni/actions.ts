"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Assegna categoria a una singola transazione */
export async function categorizeTransaction(txId: string, categoryId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato" };

  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", txId)
    .eq("user_id", data.claims.sub);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/transazioni");
  revalidatePath("/dashboard");
  return { success: true, affectedIds: [txId] };
}

/**
 * Crea una regola keyword → categoria e la applica subito a tutte
 * le transazioni senza categoria che contengono la keyword nella descrizione.
 */
export async function createCategoryRule(keyword: string, categoryId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato", count: 0, affectedIds: [] as string[] };

  const userId = data.claims.sub;
  const kw = keyword.trim();

  const { error: ruleError } = await supabase.from("category_rules").insert({
    user_id: userId,
    category_id: categoryId,
    field: "description",
    operator: "contains",
    value: kw.toLowerCase(),
  });

  if (ruleError) return { error: ruleError.message, count: 0, affectedIds: [] as string[] };

  // Applica la regola a tutte le transazioni senza categoria corrispondenti
  const { data: affected, error: updateError } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("user_id", userId)
    .is("category_id", null)
    .ilike("description", `%${kw}%`)
    .select("id");

  if (updateError) return { error: updateError.message, count: 0, affectedIds: [] as string[] };

  revalidatePath("/dashboard/transazioni");
  revalidatePath("/dashboard");

  const affectedIds = (affected ?? []).map((t) => t.id);
  return { success: true, count: affectedIds.length, affectedIds };
}
