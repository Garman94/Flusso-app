"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { formatEuro, sinkingFundInput } from "@/lib/calculations";
import { emergencyLimit, planEmergency, sinkingGroups } from "@/lib/emergency";

export type EmergencyResult =
  | { error: string }
  | { success: true; total: number; monthlyBefore: number; monthlyAfter: number };

/**
 * Emergenza: preleva da uno o più salvadanai e, se i soldi vengono dagli accantonamenti,
 * fa ripartire il piano delle voci toccate (saving_start_date + saving_offset). I limiti si
 * ricalcolano qui sui dati del database, non si prendono dal browser.
 */
export async function withdrawForEmergency(input: {
  withdrawals: { potId: string; amount: number }[];
  note?: string;
}): Promise<EmergencyResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Non autenticato." };
  const userId = data.claims.sub as string;

  const byPot = new Map<string, number>();
  for (const w of input.withdrawals) {
    const amount = Math.round(Number(w.amount) * 100) / 100;
    if (!(amount > 0)) continue;
    byPot.set(w.potId, Math.round(((byPot.get(w.potId) ?? 0) + amount) * 100) / 100);
  }
  if (byPot.size === 0) return { error: "Scrivi quanto prendi da almeno un salvadanaio." };

  const [potsRes, goalsRes, recRes] = await Promise.all([
    supabase.from("savings_pots").select("id, name, current_balance").eq("user_id", userId),
    supabase.from("goals").select("savings_pot_id").eq("user_id", userId),
    supabase.from("recurring_expenses")
      .select("id, name, tipologia, amount, amount_max, next_due_date, saving_start_date, saving_offset, savings_pot_id")
      .eq("user_id", userId)
      .not("next_due_date", "is", null)
      .not("saving_start_date", "is", null),
  ]);
  if (potsRes.error || recRes.error) return { error: (potsRes.error ?? recRes.error)!.message };
  const pots = potsRes.data ?? [];
  const items = recRes.data ?? [];

  for (const [potId, amount] of byPot) {
    const pot = pots.find(p => p.id === potId);
    if (!pot) return { error: "Salvadanaio non trovato." };
    if (amount > Number(pot.current_balance) + 0.005) {
      return { error: `In "${pot.name}" ci sono solo ${formatEuro(Number(pot.current_balance))}.` };
    }
  }

  const today = new Date(todayISO() + "T00:00:00");
  const groups = sinkingGroups(pots, (goalsRes.data ?? []).map(g => g.savings_pot_id), items);
  const updates: { id: string; saving_start_date: string; saving_offset: number }[] = [];
  let monthlyBefore = 0, monthlyAfter = 0;
  for (const g of groups) {
    const taken = g.potIds.reduce((s, id) => s + (byPot.get(id) ?? 0), 0);
    if (taken <= 0) continue;
    const inputs = items.filter(it => g.itemIds.includes(it.id)).map(sinkingFundInput);
    const balance = pots.filter(p => g.potIds.includes(p.id)).reduce((s, p) => s + Number(p.current_balance), 0);
    const plan = planEmergency(inputs, balance, taken, today);
    if (plan.exceeds) {
      const { max } = emergencyLimit(inputs, balance, today);
      return { error: `Dagli accantonamenti puoi prendere al massimo ${formatEuro(max)}: il resto serve per le prossime spese.` };
    }
    monthlyBefore += plan.monthlyBefore;
    monthlyAfter += plan.monthlyAfter;
    updates.push(...plan.items.map(it => ({ id: it.id, saving_start_date: it.savingStart, saving_offset: it.savingOffset })));
  }

  const note = input.note?.trim() ? `🚨 Emergenza: ${input.note.trim().slice(0, 120)}` : "🚨 Emergenza";
  const { error: txErr } = await supabase.from("savings_transactions").insert(
    [...byPot].map(([potId, amount]) => ({ pot_id: potId, user_id: userId, amount, type: "withdraw", note })),
  );
  if (txErr) return { error: txErr.message };

  for (const u of updates) {
    const { error } = await supabase.from("recurring_expenses")
      .update({ saving_start_date: u.saving_start_date, saving_offset: u.saving_offset })
      .eq("id", u.id).eq("user_id", userId);
    if (error) return { error: `Prelievo fatto, ma le quote non si sono aggiornate: ${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/salvadanai");
  revalidatePath("/dashboard/smart");
  return {
    success: true,
    total: Math.round([...byPot.values()].reduce((s, a) => s + a, 0) * 100) / 100,
    monthlyBefore: Math.round(monthlyBefore * 100) / 100,
    monthlyAfter: Math.round(monthlyAfter * 100) / 100,
  };
}
