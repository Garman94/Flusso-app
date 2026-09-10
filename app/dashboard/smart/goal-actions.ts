"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addGoalContribution(input: { goalId: string; amount: number; note?: string }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };
  const userId = data.claims.sub as string;

  if (!(input.amount > 0)) return { error: "Importo non valido." };

  const { data: row, error } = await supabase
    .from("goal_contributions")
    .insert({
      goal_id: input.goalId,
      user_id: userId,
      amount: input.amount,
      note: input.note?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard/smart");
  revalidatePath("/dashboard");
  return { success: true, id: row?.id as string | undefined };
}
