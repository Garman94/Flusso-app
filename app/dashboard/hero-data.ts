import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO } from "@/lib/dates";
import { balanceAt, neededRange, totalAtStartOf, type Account, type AccountTx } from "@/lib/accounts";
import { rollBalance, type IncomeInfo } from "@/lib/calculations";

// Dati della card del saldo, letti dal server insieme al resto della dashboard.
// Prima la card li chiedeva dal browser dopo l'idratazione (6 richieste, poi quelle del
// "buco" del saldo una dopo l'altra): il saldo compariva dopo 1-2,5 s, fino a 6 s.
// Ora le richieste partono in due giri, tutte in parallelo:
//   1. loadHeroBase, insieme al profilo e alle altre query che non dipendono dal periodo;
//   2. loadStartingBalance, insieme ai movimenti del periodo (condivisi con il resto della pagina).
// Stessi risultati di prima: stesse query, stesse regole (rollBalance, totalAtStartOf).

export const INCOME_COLS = "income_type, monthly_income, income_frequency, income_payday, income_variability, active_months";
const PAGE = 1000;

export type RecurringRow = {
  id: string;
  name: string;
  tipologia: "fissa" | "variabile" | "entrata";
  frequency: string;
  custom_days: number | null;
  amount: number;
  amount_max: number | null;
  next_due_date: string | null;
  saving_start_date: string | null;
  saving_offset?: number | null;
  debt_type: string | null;
  debt_total_amount: number | null;
  debt_start_date: string | null;
  due_day: number | null;
  due_month: number | null;
  match_keywords: string[] | null;
  secondary_name: string | null;
  end_date: string | null;
  last_paid_date: string | null;
  fixed_group?: string | null;
  category_id?: string | null;
};

export type MemberIncome = Partial<IncomeInfo> & { id: string; name: string; color: string; is_owner: boolean };

/** Movimento del periodo come lo usa la card (stessa query di "Dove vanno i soldi"). */
export type HeroTx = {
  id?: string;
  amount: number; date: string;
  description?: string | null; merchant?: string | null;
  member_id?: string | null;
  account_id?: string | null;
  category_id?: string | null;
  categories?: { name: string; color?: string; icon?: string } | null;
};

/** Profilo come lo legge la dashboard (select "*"). */
export type HeroProfile = {
  period_starting_balance?: number | string | null;
  period_starting_balance_date?: string | null;
} & Partial<IncomeInfo>;

export type HeroBase = {
  items: RecurringRow[];
  membersIncome: MemberIncome[];
  /** somma dei budget per categoria, senza "Accantonamenti" (già contati a parte) */
  budgetTotal: number;
  /** vuoto se non ci sono conti o manca la migration 048: si resta col saldo unico */
  accounts: Account[];
};

export type HeroStart = {
  /** saldo a inizio periodo; null = mai inserito (la card chiede il saldo di oggi) */
  startingBalance: number | null;
  /** data dell'ultimo saldo inserito a mano, se quello di questo periodo è stato riportato */
  carriedFrom: string | null;
  /** saldo di ogni conto a fine del giorno prima dell'inizio periodo (id → euro) */
  accountStart: Record<string, number>;
};

export type HeroData = HeroBase & HeroStart & {
  ownerIncome: Partial<IncomeInfo> | null;
};

/** Le query della card che non dipendono dal periodo. */
export async function loadHeroBase(supabase: SupabaseClient, userId: string): Promise<HeroBase> {
  const [recRes, memRes, budgetRes, accRes] = await Promise.all([
    // "*": comprende saving_offset (migration 041) e regge anche se la colonna non c'è ancora
    supabase.from("recurring_expenses").select("*").eq("user_id", userId),
    supabase.from("family_members").select(`id, name, color, is_owner, ${INCOME_COLS}`).eq("user_id", userId),
    // categories(name) per escludere "Accantonamenti": quella quota è già contata
    // separatamente via aggregateSinkingFunds, sommarla anche qui la conterebbe due volte.
    supabase.from("category_budgets").select("monthly_budget, categories(name)").eq("user_id", userId),
    // senza la migration 048 la query fallisce: si resta col saldo unico di prima
    supabase.from("accounts").select("id, name, member_id, anchor_balance, anchor_date, checked_at").eq("archived", false).order("created_at"),
  ]);
  return {
    items: (recRes.data ?? []) as RecurringRow[],
    membersIncome: (memRes.data ?? []) as MemberIncome[],
    budgetTotal: (budgetRes.data ?? [])
      .filter(r => (r.categories as unknown as { name: string } | null)?.name?.toLowerCase() !== "accantonamenti")
      .reduce((s, r) => s + Number(r.monthly_budget), 0),
    accounts: accRes.error
      ? []
      : ((accRes.data ?? []).map(a => ({ ...a, anchor_balance: Number(a.anchor_balance) })) as Account[]),
  };
}

/**
 * Saldo a inizio periodo: con i conti, la somma dei loro saldi; altrimenti quello inserito per
 * questo periodo, oppure l'ultimo inserito riportato in avanti con i movimenti registrati nel frattempo.
 */
export async function loadStartingBalance(
  supabase: SupabaseClient,
  userId: string,
  profile: HeroProfile | null,
  accounts: Account[],
  periodFrom: string,
): Promise<HeroStart> {
  const accountStart: Record<string, number> = {};
  if (accounts.length) {
    // somma dei saldi dei conti a fine del giorno prima dell'inizio periodo
    const before = addDaysISO(periodFrom, -1);
    const range = neededRange(accounts, before)!;
    const gapTxs = await fetchAccountAmounts(supabase, userId, range.from, range.to);
    for (const a of accounts) accountStart[a.id] = balanceAt(a, gapTxs, before);
    return { startingBalance: totalAtStartOf(accounts, gapTxs, periodFrom), carriedFrom: null, accountStart };
  }
  const known = profile?.period_starting_balance;
  const knownDate = profile?.period_starting_balance_date ?? null;
  if (known == null || !knownDate) return { startingBalance: null, carriedFrom: null, accountStart };
  if (knownDate === periodFrom) return { startingBalance: Number(known), carriedFrom: null, accountStart };
  const [from, to] = knownDate < periodFrom ? [knownDate, periodFrom] : [periodFrom, knownDate];
  const gap = await fetchAmounts(supabase, userId, from, to);
  return { startingBalance: rollBalance(Number(known), knownDate, periodFrom, gap), carriedFrom: knownDate, accountStart };
}

/** Movimenti (data, importo) in [from, to): a pagine, per non fermarsi al limite di 1000 righe. */
async function fetchAmounts(supabase: SupabaseClient, userId: string, from: string, to: string) {
  const out: { date: string; amount: number }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, amount")
      .eq("user_id", userId)
      .gte("date", from)
      .lt("date", to)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    out.push(...(data as { date: string; amount: number }[]));
    if (data.length < PAGE) break;
  }
  return out;
}

/** Movimenti dei conti (data, importo, conto) in [from, to], estremi compresi: a pagine. */
async function fetchAccountAmounts(supabase: SupabaseClient, userId: string, from: string, to: string) {
  const out: AccountTx[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, amount, account_id")
      .eq("user_id", userId)
      .not("account_id", "is", null)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    out.push(...(data as AccountTx[]));
    if (data.length < PAGE) break;
  }
  return out;
}
