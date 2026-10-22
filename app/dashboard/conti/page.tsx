import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, todayISO } from "@/lib/dates";
import { neededRange, type Account, type AccountTx } from "@/lib/accounts";
import { ContiClient, type UnassignedGroup } from "./conti-client";

// Conti (migration 048): saldo di ogni conto, "Quadra" con la banca, movimenti senza conto, salvadanai collegati.

const PAGE = 1000;

async function ContiContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const userId = data.claims.sub;
  const today = todayISO();

  const [accRes, membersRes, potsRes] = await Promise.all([
    supabase.from("accounts").select("id, name, member_id, anchor_balance, anchor_date, checked_at, bank_ref").eq("archived", false).order("created_at"),
    supabase.from("family_members").select("id, name, color, is_owner").eq("user_id", userId).order("created_at"),
    supabase.from("savings_pots").select("id, name, emoji, current_balance, account_id").eq("user_id", userId).order("created_at"),
  ]);
  if (accRes.error) {
    return <p className="text-sm text-muted-foreground">I conti non sono ancora attivi.</p>;
  }
  const accounts = (accRes.data ?? []).map(a => ({ ...a, anchor_balance: Number(a.anchor_balance) })) as Account[];

  // Movimenti dei conti: dalle ancore (o da 120 giorni fa, per i doppioni) a oggi, a pagine
  const range = neededRange(accounts, today);
  const since = range && range.from < addDaysISO(today, -120) ? range.from : addDaysISO(today, -120);
  const txs: AccountTx[] = [];
  if (accounts.length) {
    for (let offset = 0; ; offset += PAGE) {
      const { data: page, error } = await supabase.from("transactions")
        .select("date, amount, account_id, description")
        .eq("user_id", userId).not("account_id", "is", null).gte("date", since)
        .order("date").order("id").range(offset, offset + PAGE - 1);
      if (error || !page) break;
      txs.push(...page.map(t => ({ ...t, amount: Number(t.amount) })));
      if (page.length < PAGE) break;
    }
  }

  // Movimenti senza conto, raggruppati per persona
  const groups = new Map<string, UnassignedGroup>();
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error } = await supabase.from("transactions")
      .select("member_id, date")
      .eq("user_id", userId).is("account_id", null)
      .order("date").order("id").range(offset, offset + PAGE - 1);
    if (error || !page) break;
    for (const t of page) {
      const key = t.member_id ?? "";
      const g = groups.get(key) ?? { memberId: t.member_id, count: 0, from: t.date, to: t.date };
      g.count += 1;
      if (t.date < g.from) g.from = t.date;
      if (t.date > g.to) g.to = t.date;
      groups.set(key, g);
    }
    if (page.length < PAGE) break;
  }

  return (
    <ContiClient
      accounts={accounts}
      txs={txs}
      members={(membersRes.data ?? []) as { id: string; name: string; color: string; is_owner: boolean | null }[]}
      pots={(potsRes.data ?? []).map(p => ({ ...p, current_balance: Number(p.current_balance) })) as { id: string; name: string; emoji: string; current_balance: number; account_id: string | null }[]}
      unassigned={[...groups.values()].sort((a, b) => b.count - a.count)}
      today={today}
    />
  );
}

export default function ContiPage() {
  return (
    <Suspense fallback={<div className="h-64 rounded-xl border bg-muted/30 animate-pulse" />}>
      <ContiContent />
    </Suspense>
  );
}
