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
 * Crea una regola keyword → categoria e la applica subito alle transazioni corrispondenti.
 * Di default a TUTTE (sovrascrive anche le categorie esistenti: pannello Regole);
 * con `onlyUncategorized` solo a quelle ancora senza categoria ("Ricorda questa scelta").
 * Le regole valgono anche per gli import futuri (Excel e screenshot).
 */
export async function createCategoryRule(keyword: string, categoryId: string, opts: { onlyUncategorized?: boolean } = {}) {
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

  let update = supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("user_id", userId)
    .ilike("description", `%${kw}%`);
  if (opts.onlyUncategorized) update = update.is("category_id", null);
  const { data: affected, error: updateError } = await update.select("id");

  if (updateError) return { error: updateError.message, count: 0, affectedIds: [] as string[] };

  revalidatePath("/dashboard/transazioni");
  revalidatePath("/dashboard");

  const affectedIds = (affected ?? []).map((t) => t.id);
  return { success: true, count: affectedIds.length, affectedIds };
}

/** Elimina una regola di categoria */
export async function deleteCategoryRule(ruleId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato" };

  const { error } = await supabase
    .from("category_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", data.claims.sub);

  if (error) return { error: error.message };
  return { success: true };
}
