"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markRecurringAsPaid(recurringExpenseId: string, amount: number, paidDate: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };
  const userId = data.claims.sub;

  const { error: confirmError } = await supabase.from("payment_confirmations").insert({
    recurring_expense_id: recurringExpenseId,
    user_id: userId,
    paid_date: paidDate,
    amount_paid: amount,
  });
  if (confirmError) {
    console.error("[recurring-payment-actions]", confirmError);
    return { error: `Errore: ${confirmError.message}` };
  }

  const { error: updateError } = await supabase
    .from("recurring_expenses")
    .update({ last_paid_date: paidDate, payment_status: "paid" })
    .eq("id", recurringExpenseId)
    .eq("user_id", userId);
  if (updateError) {
    console.error("[recurring-payment-actions]", updateError);
    return { error: `Errore: ${updateError.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
