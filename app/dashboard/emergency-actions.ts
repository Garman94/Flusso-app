"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { formatEuro, sinkingFundInput } from "@/lib/calculations";
import { emergencyLimit, planEmergency, sinkingGroups } from "@/lib/emergency";

export type EmergencyResult =
  | { error: string }
  | {
      success: true; total: number; monthlyBefore: number; monthlyAfter: number;
      /** voci di questo mese toccate: soldi da rimettere entro la scadenza */
      refill: { name: string; amount: number; due: string }[];
    };

/**
 * Emergenza: preleva da uno o più salvadanai e, se i soldi vengono dagli accantonamenti,
 * fa ripartire il piano delle voci toccate (saving_start_date + saving_offset). I limiti si
 * ricalcolano qui sui dati del database, non si prendono dal browser. Oltre il massimo
 * consigliato solo con `overLimit` (l'utente ha confermato l'avviso).
 */
export async function withdrawForEmergency(input: {
  withdrawals: { potId: string; amount: number }[];
  note?: string;
  overLimit?: boolean;
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
    // "*": senza la migration 041 manca saving_offset, e si scopre qui sotto (hasOffsetColumn)
    supabase.from("recurring_expenses")
      .select("*")
      .eq("user_id", userId)
      .not("next_due_date", "is", null)
      .not("saving_start_date", "is", null),
  ]);
  if (potsRes.error || recRes.error) return { error: (potsRes.error ?? recRes.error)!.message };
  const pots = potsRes.data ?? [];
  const items = recRes.data ?? [];
  // Prima della migration 041: i prelievi dai salvadanai liberi vanno, il ricalcolo no.
  const hasOffsetColumn = items.length === 0 || "saving_offset" in items[0];

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
  const refill: { name: string; amount: number; due: string }[] = [];
  for (const g of groups) {
    const taken = g.potIds.reduce((s, id) => s + (byPot.get(id) ?? 0), 0);
    if (taken <= 0) continue;
    const inputs = items.filter(it => g.itemIds.includes(it.id)).map(sinkingFundInput);
    const balance = pots.filter(p => g.potIds.includes(p.id)).reduce((s, p) => s + Number(p.current_balance), 0);
    const plan = planEmergency(inputs, balance, taken, today);
    if (plan.uncovered) return { error: "Stai prendendo più di quello che c'è da parte per gli accantonamenti." };
    if (plan.exceeds && !input.overLimit) {
      const { max } = emergencyLimit(inputs, balance, today);
      return { error: `Oltre ${formatEuro(max)} tocchi i soldi delle prossime spese: conferma l'avviso per prenderli lo stesso.` };
    }
    if (plan.items.length > 0 && !hasOffsetColumn) {
      return { error: "Dagli accantonamenti non si può ancora prendere: manca un aggiornamento del database. Dagli altri salvadanai sì." };
    }
    monthlyBefore += plan.monthlyBefore;
    monthlyAfter += plan.monthlyAfter;
    updates.push(...plan.items.map(it => ({ id: it.id, saving_start_date: it.savingStart, saving_offset: it.savingOffset })));
    refill.push(...plan.items.filter(it => it.dueThisMonth).map(it => ({ name: it.name, amount: it.taken, due: it.due })));
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
    refill,
  };
}
