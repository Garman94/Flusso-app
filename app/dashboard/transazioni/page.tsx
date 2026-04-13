import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { TransazioniClient } from "./transazioni-client";

async function TransazioniContent({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const userId = data.claims.sub;
  const params = await searchParams;
  const initialFilter =
    params.filter === "uncategorized" ? "senza_cat" : "all";

  const [profileRes, transactionsRes, categoriesRes, uncategorizedRes, displayRulesRes, categoryRulesRes] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", userId).single(),
    supabase
      .from("transactions")
      .select("*, categories(id, name, color, icon)")
      .eq("user_id", userId)
      .order("date", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, color, icon")
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order("name"),
    supabase
      .from("transactions")
      .select("id, date, amount, description, category_id")
      .eq("user_id", userId)
      .is("category_id", null)
      .order("date", { ascending: false }),
    supabase
      .from("display_rules")
      .select("id, find_text, replace_with")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("category_rules")
      .select("id, value, category_id, categories(name, icon, color)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <TransazioniClient
      userId={userId}
      plan={profileRes.data?.plan ?? "free"}
      initialTransactions={transactionsRes.data ?? []}
      categories={categoriesRes.data ?? []}
      initialUncategorized={(uncategorizedRes.data ?? []) as any}
      initialDisplayRules={(displayRulesRes.data ?? []) as any}
      initialCategoryRules={(categoryRulesRes.data ?? []) as any}
      initialFilter={initialFilter}
    />
  );
}

export default function TransazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="rounded-xl border p-5 h-20 bg-muted/30" />
          <div className="rounded-xl border p-5 h-96 bg-muted/30" />
        </div>
      }
    >
      <TransazioniContent searchParams={searchParams} />
    </Suspense>
  );
}
