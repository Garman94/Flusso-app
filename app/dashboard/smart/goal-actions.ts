"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncGoalsWithPot } from "../goal-sync";

function revalidate() {
  revalidatePath("/dashboard/smart");
  revalidatePath("/dashboard/salvadanai");
  revalidatePath("/dashboard");
}

async function auth() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: (data?.claims?.sub as string | undefined) ?? null };
}

/** L'obiettivo e, se esiste, il salvadanaio collegato. */
async function goalWithPot(goalId: string) {
  const { supabase, userId } = await auth();
  if (!userId) return { supabase, userId, goal: null, pot: null };
  const { data: goal } = await supabase.from("goals").select("*").eq("id", goalId).eq("user_id", userId).maybeSingle();
  const { data: pot } = goal?.savings_pot_id
    ? await supabase.from("savings_pots").select("id, name, current_balance").eq("id", goal.savings_pot_id).eq("user_id", userId).maybeSingle()
    : { data: null };
  return { supabase, userId, goal, pot };
}

/**
 * Mette soldi da parte per un obiettivo. Se l'obiettivo ha un salvadanaio è un versamento nel
 * salvadanaio (l'obiettivo vale il suo saldo, lib/goals.ts); altrimenti un contributo come prima.
 */
export async function addGoalContribution(input: { goalId: string; amount: number; note?: string }) {
  const { supabase, userId, goal, pot } = await goalWithPot(input.goalId);
  if (!userId) return { error: "Non autenticato." };
  if (!goal) return { error: "Obiettivo non trovato." };
  if (!(input.amount > 0)) return { error: "Importo non valido." };
  const note = input.note?.trim() || null;

  if (pot) {
    const { data: row, error } = await supabase.from("savings_transactions").insert({
      pot_id: pot.id, user_id: userId, amount: input.amount, type: "deposit",
      note: note ? `🎯 ${goal.name}: ${note}` : `🎯 ${goal.name}`,
    }).select("id").single();
    if (error) return { error: error.message };
    const before = Number(pot.current_balance);
    await syncGoalsWithPot(supabase, userId, pot.id, before, before + input.amount);
    revalidate();
    return { success: true, id: row?.id as string | undefined, toPot: true };
  }

  const { data: row, error } = await supabase
    .from("goal_contributions")
    .insert({ goal_id: goal.id, user_id: userId, amount: input.amount, note })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidate();
  return { success: true, id: row?.id as string | undefined, toPot: false };
}

/**
 * Crea il salvadanaio dell'obiettivo (stesso nome, icona e traguardo), ci mette quello che
 * l'obiettivo aveva già da parte e li collega.
 */
export async function createPotForGoal(goalId: string) {
  const { supabase, userId, goal, pot } = await goalWithPot(goalId);
  if (!userId) return { error: "Non autenticato." };
  if (!goal) return { error: "Obiettivo non trovato." };
  if (pot) return { success: true, potId: pot.id as string };

  const { data: created, error } = await supabase.from("savings_pots").insert({
    user_id: userId, name: goal.name, emoji: goal.icon || "🎯", target_amount: goal.target_amount,
  }).select("id").single();
  if (error || !created) return { error: error?.message ?? "Salvadanaio non creato." };

  const saved = Number(goal.current_amount ?? 0);
  if (saved > 0) {
    const { error: txErr } = await supabase.from("savings_transactions").insert({
      pot_id: created.id, user_id: userId, amount: saved, type: "deposit", note: "Già da parte per l'obiettivo",
    });
    if (txErr) return { error: txErr.message };
  }
  const { error: linkErr } = await supabase.from("goals")
    .update({ savings_pot_id: created.id, current_amount: saved }).eq("id", goal.id).eq("user_id", userId);
  if (linkErr) return { error: linkErr.message };

  revalidate();
  return { success: true, potId: created.id as string };
}

/**
 * Obiettivo e salvadanaio segnavano cifre diverse (da prima che fossero una cosa sola):
 * "pot" tiene il saldo del salvadanaio, "goal" porta il salvadanaio alla cifra dell'obiettivo
 * con un versamento o un prelievo.
 */
export async function reconcileGoal(goalId: string, keep: "pot" | "goal") {
  const { supabase, userId, goal, pot } = await goalWithPot(goalId);
  if (!userId) return { error: "Non autenticato." };
  if (!goal || !pot) return { error: "Obiettivo o salvadanaio non trovato." };

  const recorded = Number(goal.current_amount), inPot = Number(pot.current_balance);
  if (keep === "goal") {
    const diff = Math.round((recorded - inPot) * 100) / 100;
    if (Math.abs(diff) > 0.005) {
      if (diff < 0 && -diff > inPot + 0.005) return { error: "Il salvadanaio andrebbe sotto zero." };
      const { error } = await supabase.from("savings_transactions").insert({
        pot_id: pot.id, user_id: userId, amount: Math.abs(diff), type: diff > 0 ? "deposit" : "withdraw",
        note: `Allineato all'obiettivo ${goal.name}`,
      });
      if (error) return { error: error.message };
    }
  }
  // In entrambi i casi l'obiettivo prende il saldo (con keep "goal" è già uguale alla sua cifra).
  const amount = keep === "goal" ? recorded : inPot;
  const { error } = await supabase.from("goals").update({ current_amount: amount }).eq("id", goal.id).eq("user_id", userId);
  if (error) return { error: error.message };

  revalidate();
  return { success: true, amount };
}
