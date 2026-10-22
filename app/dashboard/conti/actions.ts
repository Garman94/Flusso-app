"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";

// Conti (migration 048): scritture col client dell'utente, le regole RLS fanno il resto.
// Il trigger default_transaction_account rifiuta i conti di altri utenti.

type Result = { error?: string };

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub as string | undefined };
}

function done(error: { message: string } | null): Result {
  if (error) return { error: error.message.includes("DEMO_READONLY") ? "Nella demo non si può salvare." : error.message };
  revalidatePath("/dashboard/conti");
  revalidatePath("/dashboard");
  return {};
}

/** Nuovo conto con il saldo letto oggi in banca. */
export async function createAccount(input: { name: string; memberId: string | null; balance: number }): Promise<Result> {
  const { supabase, userId } = await session();
  if (!userId) return { error: "Non autenticato" };
  const name = input.name.trim();
  if (!name || name.length > 40) return { error: "Scrivi un nome (massimo 40 caratteri)." };
  if (!Number.isFinite(input.balance)) return { error: "Saldo non valido." };
  const { error } = await supabase.from("accounts").insert({
    user_id: userId, name, member_id: input.memberId, anchor_balance: input.balance, anchor_date: todayISO(), checked_at: todayISO(),
  });
  return done(error);
}

/**
 * "Quadra": se il saldo di Flusso è uguale a quello della banca si segna solo il controllo; se è
 * diverso e l'utente conferma, si riparte dal saldo della banca (nuova ancora oggi). Nessun movimento finto.
 */
export async function confirmBankBalance(accountId: string, balance: number, restart: boolean): Promise<Result> {
  const { supabase, userId } = await session();
  if (!userId) return { error: "Non autenticato" };
  if (!Number.isFinite(balance)) return { error: "Saldo non valido." };
  const today = todayISO();
  const patch = restart ? { anchor_balance: balance, anchor_date: today, checked_at: today } : { checked_at: today };
  const { error } = await supabase.from("accounts").update(patch).eq("id", accountId).eq("user_id", userId);
  return done(error);
}

export async function renameAccount(accountId: string, name: string, memberId: string | null): Promise<Result> {
  const { supabase, userId } = await session();
  if (!userId) return { error: "Non autenticato" };
  const n = name.trim();
  if (!n || n.length > 40) return { error: "Scrivi un nome (massimo 40 caratteri)." };
  const { error } = await supabase.from("accounts").update({ name: n, member_id: memberId }).eq("id", accountId).eq("user_id", userId);
  return done(error);
}

/** Elimina il conto: i suoi movimenti restano, senza conto. */
export async function deleteAccount(accountId: string): Promise<Result> {
  const { supabase, userId } = await session();
  if (!userId) return { error: "Non autenticato" };
  const { error } = await supabase.from("accounts").delete().eq("id", accountId).eq("user_id", userId);
  return done(error);
}

/**
 * Mette sul conto i movimenti ancora senza conto di una persona (null = senza persona).
 * Quelli con data fino all'ancora del conto non ne cambiano il saldo: erano già nel saldo della banca.
 */
export async function assignUnassigned(memberId: string | null, accountId: string): Promise<Result & { count?: number }> {
  const { supabase, userId } = await session();
  if (!userId) return { error: "Non autenticato" };
  let q = supabase.from("transactions").update({ account_id: accountId }).eq("user_id", userId).is("account_id", null);
  q = memberId ? q.eq("member_id", memberId) : q.is("member_id", null);
  const { data, error } = await q.select("id");
  return { ...done(error), count: data?.length ?? 0 };
}

/** Dove stanno i soldi del salvadanaio (null = da nessuna parte in particolare). */
export async function linkPot(potId: string, accountId: string | null): Promise<Result> {
  const { supabase, userId } = await session();
  if (!userId) return { error: "Non autenticato" };
  const { error } = await supabase.from("savings_pots").update({ account_id: accountId }).eq("id", potId).eq("user_id", userId);
  return done(error);
}
