"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeText } from "@/lib/categorize";
import { categoryKind } from "@/lib/money";

// Admin → "Dizionario condiviso" (migration 044): scrittura solo dal server, col service role,
// dopo il controllo che chi chiama sia admin. Gli utenti lo leggono e basta.

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
  return !!email && admins.includes(email);
}

type Result = { error?: string; id?: string };

/** Aggiunge (o corregge) una parola: `source` "utenti" quando viene da una proposta approvata. */
export async function saveDictionaryEntry(keyword: string, categoryName: string, source: "admin" | "utenti" = "admin"): Promise<Result> {
  if (!(await isAdmin())) return { error: "Non autorizzato." };
  const kw = normalizeText(keyword);
  if (kw.length < 2 || kw.length > 60) return { error: "La parola deve avere da 2 a 60 caratteri." };

  const service = createServiceClient();
  const { data: cat } = await service.from("categories").select("name").is("user_id", null).eq("name", categoryName).maybeSingle();
  if (!cat || categoryKind(cat.name) !== "expense") return { error: "Scegli una categoria di spesa predefinita." };

  const { data, error } = await service.from("merchant_dictionary")
    .upsert({ keyword: kw, category_name: cat.name, source }, { onConflict: "keyword" })
    .select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin");
  return { id: data.id };
}

export async function removeDictionaryEntry(id: string): Promise<Result> {
  if (!(await isAdmin())) return { error: "Non autorizzato." };
  const { error } = await createServiceClient().from("merchant_dictionary").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin");
  return {};
}
