"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { categorize } from "@/lib/categorize";
import { EDITABLE_FIELDS, type EditableTx } from "@/lib/transaction-edit";

const TX_SELECT = "*, categories(id, name, color, icon), family_members(id, name, color)";

/**
 * Pannello "Modifica movimento" (transaction-sheet.tsx): salva solo i campi passati, cioè quelli cambiati.
 * Categoria, persona e conto devono essere dell'utente (le categorie anche predefinite).
 */
export async function updateTransaction(txId: string, patch: Partial<EditableTx>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato" };
  const userId = data.claims.sub;

  const update: Partial<EditableTx> = {};
  for (const f of EDITABLE_FIELDS) if (f in patch) Object.assign(update, { [f]: patch[f] ?? null });
  if (Object.keys(update).length === 0) return { error: "Niente da salvare" };

  if ("date" in update && (!/^\d{4}-\d{2}-\d{2}$/.test(String(update.date)) || Number.isNaN(Date.parse(String(update.date))))) {
    return { error: "Data non valida" };
  }
  if ("amount" in update) {
    const n = Math.round(Number(update.amount) * 100) / 100;
    if (!Number.isFinite(n) || n === 0) return { error: "Importo non valido" };
    update.amount = n;
  }
  if ("description" in update) {
    const d = String(update.description ?? "").trim();
    if (!d) return { error: "Scrivi una descrizione" };
    update.description = d;
  }
  if ("notes" in update) update.notes = update.notes?.trim() || null;

  if (update.category_id) {
    const { data: c } = await supabase.from("categories").select("id")
      .eq("id", update.category_id).or(`user_id.eq.${userId},user_id.is.null`).maybeSingle();
    if (!c) return { error: "Categoria non trovata" };
  }
  if (update.member_id) {
    const { data: m } = await supabase.from("family_members").select("id")
      .eq("id", update.member_id).eq("user_id", userId).maybeSingle();
    if (!m) return { error: "Persona non trovata" };
  }
  if (update.account_id) {
    const { data: a } = await supabase.from("accounts").select("id")
      .eq("id", update.account_id).eq("user_id", userId).maybeSingle();
    if (!a) return { error: "Conto non trovato" };
  }

  const { data: tx, error } = await supabase.from("transactions")
    .update(update).eq("id", txId).eq("user_id", userId)
    .select(TX_SELECT).single();
  if (error) return { error: error.message };

  revalidatePath("/dashboard/transazioni");
  revalidatePath("/dashboard");
  return { transaction: tx };
}

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

/**
 * Segna come giroconti i movimenti con un componente della famiglia (lib/money.ts →
 * familyTransferCandidates) e aggiunge una regola col suo nome, così anche i prossimi import
 * li mettono tra i giroconti. Aggiorna solo i movimenti indicati, non tutti quelli col nome.
 */
export async function markFamilyTransfers(memberName: string, txIds: string[], transferCategoryId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato", affectedIds: [] as string[] };
  const userId = data.claims.sub;

  const { data: affected, error } = await supabase
    .from("transactions")
    .update({ category_id: transferCategoryId })
    .eq("user_id", userId)
    .in("id", txIds)
    .select("id");
  if (error) return { error: error.message, affectedIds: [] as string[] };

  const kw = memberName.trim().toLowerCase().split(/\s+/)[0];
  const { data: existing } = await supabase
    .from("category_rules").select("id").eq("user_id", userId).eq("value", kw).limit(1);
  if (kw && !existing?.length) {
    await supabase.from("category_rules").insert({
      user_id: userId, category_id: transferCategoryId, field: "description", operator: "contains", value: kw,
    });
  }

  revalidatePath("/dashboard/transazioni");
  revalidatePath("/dashboard");
  return { success: true, affectedIds: (affected ?? []).map(t => t.id) };
}

/**
 * "✨ Categorizza in automatico": ai movimenti senza categoria applica regole personali,
 * dizionario condiviso, parole del codice (lib/categorize.ts → categorize). Aggiorna solo quelli
 * ancora senza categoria, quindi le scelte fatte a mano non si toccano.
 */
export async function autoCategorize(): Promise<{ error?: string; assigned: { id: string; category_id: string }[]; remaining: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato", assigned: [], remaining: 0 };
  const userId = data.claims.sub;

  const [txRes, rulesRes, dictRes, catsRes] = await Promise.all([
    supabase.from("transactions").select("id, description, merchant").eq("user_id", userId).is("category_id", null).limit(5000),
    supabase.from("category_rules").select("value, category_id").eq("user_id", userId),
    supabase.from("merchant_dictionary").select("keyword, category_name"),
    supabase.from("categories").select("id, name, user_id").or(`user_id.eq.${userId},user_id.is.null`),
  ]);
  if (txRes.error) return { error: txRes.error.message, assigned: [], remaining: 0 };

  // A parità di nome, la categoria dell'utente prima di quella predefinita.
  const categories = [...(catsRes.data ?? [])].sort((a, b) => Number(a.user_id === null) - Number(b.user_id === null));
  const ctx = { userRules: rulesRes.data ?? [], dictionary: dictRes.data ?? [], categories };
  const byCategory = new Map<string, string[]>();
  for (const t of txRes.data ?? []) {
    const id = categorize({ description: `${t.description ?? ""} ${t.merchant ?? ""}` }, ctx);
    if (id) byCategory.set(id, [...(byCategory.get(id) ?? []), t.id]);
  }

  const assigned: { id: string; category_id: string }[] = [];
  for (const [categoryId, ids] of byCategory) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: done, error } = await supabase.from("transactions")
        .update({ category_id: categoryId })
        .eq("user_id", userId).in("id", chunk).is("category_id", null)
        .select("id");
      if (error) return { error: error.message, assigned, remaining: (txRes.data ?? []).length - assigned.length };
      assigned.push(...(done ?? []).map(d => ({ id: d.id, category_id: categoryId })));
    }
  }

  revalidatePath("/dashboard/transazioni");
  revalidatePath("/dashboard");
  return { assigned, remaining: (txRes.data ?? []).length - assigned.length };
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
