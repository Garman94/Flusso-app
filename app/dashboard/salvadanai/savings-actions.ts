"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/salvadanai");
  revalidatePath("/dashboard/smart");
}

type PotInput = {
  name: string;
  emoji: string;
  target_amount: number | null;
  is_shared: boolean;
  color: string;
  memberIds: (string | null)[]; // family_members condivisi (null = titolare)
};

export async function createPot(input: PotInput) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };
  const userId = data.claims.sub as string;

  if (!input.name.trim()) return { error: "Il nome è obbligatorio." };

  const { data: pot, error } = await supabase
    .from("savings_pots")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      emoji: input.emoji || "🐷",
      target_amount: input.target_amount,
      is_shared: input.is_shared,
      color: input.color,
    })
    .select("id")
    .single();

  if (error || !pot) return { error: error?.message ?? "Errore nel salvataggio." };

  if (input.is_shared && input.memberIds.length > 0) {
    await supabase.from("savings_pot_members").insert(
      input.memberIds.map(m => ({ pot_id: pot.id, member_id: m }))
    );
  }

  revalidate();
  return { success: true, id: pot.id };
}

export async function updatePot(id: string, input: Omit<PotInput, "memberIds">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("savings_pots")
    .update({
      name: input.name.trim(),
      emoji: input.emoji || "🐷",
      target_amount: input.target_amount,
      is_shared: input.is_shared,
      color: input.color,
    })
    .eq("id", id)
    .eq("user_id", data.claims.sub);

  if (error) return { error: error.message };
  revalidate();
  return { success: true };
}

export async function deletePot(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("savings_pots")
    .delete()
    .eq("id", id)
    .eq("user_id", data.claims.sub);

  if (error) return { error: error.message };
  revalidate();
  return { success: true };
}

export async function addSavingsTransaction(input: {
  potId: string;
  amount: number;
  type: "deposit" | "withdraw";
  note?: string;
  memberId?: string | null;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };
  const userId = data.claims.sub as string;

  if (!(input.amount > 0)) return { error: "Importo non valido." };

  const { error } = await supabase.from("savings_transactions").insert({
    pot_id: input.potId,
    user_id: userId,
    member_id: input.memberId ?? null,
    amount: input.amount,
    type: input.type,
    note: input.note?.trim() || null,
  });

  if (error) return { error: error.message };
  revalidate();
  return { success: true };
}
