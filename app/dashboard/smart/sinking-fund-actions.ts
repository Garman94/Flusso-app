"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addMonths, monthsPerCycle } from "@/lib/calculations";

export async function resetSavingStartDate(recurringId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };

  const today = new Date().toISOString().split("T")[0];

  const { error } = await supabase
    .from("recurring_expenses")
    .update({ saving_start_date: today })
    .eq("id", recurringId)
    .eq("user_id", data.claims.sub);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/smart");
  revalidatePath("/dashboard");
  return { success: true };
}

export type MarkPaidOptions = {
  deductFromPiggy: boolean;
  paidAmount?: number;
  paidOn?: string;
};

export async function markSinkingFundPaid(
  recurringId: string,
  options: MarkPaidOptions,
) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };
  const userId = data.claims.sub;

  const { data: rec } = await supabase
    .from("recurring_expenses")
    .select("amount, amount_max, tipologia, frequency, custom_days, next_due_date")
    .eq("id", recurringId)
    .eq("user_id", userId)
    .single();
  if (!rec) return { error: "Spesa non trovata." };
  if (!rec.next_due_date) return { error: "Voce non configurata come accantonamento." };

  const cycleMonths = monthsPerCycle(rec.frequency, rec.custom_days);
  const newDueDate = addMonths(new Date(rec.next_due_date + "T00:00:00"), cycleMonths);
  const newSavingStart = options.paidOn ?? new Date().toISOString().split("T")[0];

  const fallbackAmount =
    rec.tipologia === "variabile" && rec.amount_max != null
      ? (Number(rec.amount) + Number(rec.amount_max)) / 2
      : Number(rec.amount);
  const amountToDeduct = options.paidAmount ?? fallbackAmount;

  const { error: updateErr } = await supabase
    .from("recurring_expenses")
    .update({
      next_due_date: newDueDate.toISOString().split("T")[0],
      saving_start_date: newSavingStart,
    })
    .eq("id", recurringId)
    .eq("user_id", userId);
  if (updateErr) return { error: updateErr.message };

  let newPiggyBalance: number | null = null;
  if (options.deductFromPiggy) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("piggy_balance")
      .eq("id", userId)
      .single();
    const current = Number(profile?.piggy_balance ?? 0);
    newPiggyBalance = Math.round((current - amountToDeduct) * 100) / 100;

    // Preferisci scalare da un salvadanaio (il trigger sync_piggy_balance
    // aggiorna profiles.piggy_balance). Fallback: update diretto se non ci sono pot.
    const { data: pot } = await supabase
      .from("savings_pots")
      .select("id")
      .eq("user_id", userId)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (pot?.id) {
      const { error: txErr } = await supabase.from("savings_transactions").insert({
        pot_id: pot.id,
        user_id: userId,
        amount: amountToDeduct,
        type: "withdraw",
        note: "Pagamento accantonamento",
      });
      if (txErr) return { error: txErr.message };
    } else {
      const { error: piggyErr } = await supabase
        .from("profiles")
        .update({ piggy_balance: newPiggyBalance })
        .eq("id", userId);
      if (piggyErr) return { error: piggyErr.message };
    }
  }

  revalidatePath("/dashboard/smart");
  revalidatePath("/dashboard");
  return {
    success: true,
    newDueDate: newDueDate.toISOString().split("T")[0],
    newSavingStart,
    deducted: options.deductFromPiggy ? amountToDeduct : 0,
    newPiggyBalance,
  };
}
