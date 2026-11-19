// Le query del riepilogo di un periodo chiuso, uguali per la pagina /dashboard/riepilogo (client
// dell'utente, con RLS) e per l'email del mese (service role, senza RLS): per questo ogni query
// filtra per user_id. I calcoli sono in lib/recap.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { previousPeriods } from "./period";
import { isFixedExpense, type PlanItem } from "./fixed-expenses";
import { buildRecap, RECAP_HISTORY, type Period, type Recap, type RecapTx } from "./recap";

const PAGE = 1000;

async function fetchTxs(client: SupabaseClient, userId: string, from: string, to: string): Promise<RecapTx[]> {
  const out: RecapTx[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client
      .from("transactions")
      .select("id, date, amount, description, merchant, category_id, categories(name, icon, color)")
      .eq("user_id", userId).gte("date", from).lte("date", to)
      .order("date", { ascending: false }).order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    out.push(...(data as unknown as RecapTx[]));
    if (data.length < PAGE) break;
  }
  return out;
}

export type RecapData = {
  recap: Recap;
  /** movimenti del periodo e dei RECAP_HISTORY + 1 prima */
  txs: RecapTx[];
  /** i periodi prima, il più recente per primo */
  previous: Period[];
  /** data del primo movimento mai caricato */
  firstDate: string | null;
};

/** Riepilogo del periodo `sel` (chiuso), con `today` per lo stato delle spese fisse. */
export async function loadRecap(
  client: SupabaseClient,
  userId: string,
  payDay: number,
  sel: Period & { year: number; month: number },
  today: string,
): Promise<RecapData> {
  const previous = previousPeriods(payDay, sel.year, sel.month, RECAP_HISTORY + 1);
  const [txs, budgetsRes, recurringRes, firstRes, categoriesRes] = await Promise.all([
    fetchTxs(client, userId, previous[previous.length - 1]?.from ?? sel.from, sel.to),
    client.from("category_budgets").select("category_id, monthly_budget").eq("user_id", userId),
    client.from("recurring_expenses").select("*").eq("user_id", userId),
    client.from("transactions").select("date").eq("user_id", userId).order("date", { ascending: true }).limit(1).maybeSingle(),
    client.from("categories").select("id, name, icon").or(`user_id.eq.${userId},user_id.is.null`),
  ]);
  const planItems = ((recurringRes.data ?? []) as PlanItem[]).filter(it => isFixedExpense(it) || it.debt_type);
  const recap = buildRecap(txs, sel, previous, budgetsRes.data ?? [], planItems, today, categoriesRes.data ?? []);
  return { recap, txs, previous, firstDate: (firstRes.data?.date as string | undefined) ?? null };
}
