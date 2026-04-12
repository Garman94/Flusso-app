import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { TransazioniClient } from "./transazioni-client";

async function TransazioniContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const userId = data.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*, categories(id, name, color, icon)")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(100);

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, color, icon")
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order("name");

  return (
    <TransazioniClient
      userId={userId}
      plan={profile?.plan ?? "free"}
      initialTransactions={transactions ?? []}
      categories={categories ?? []}
    />
  );
}

export default function TransazioniPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="rounded-xl border p-5 h-20 bg-muted/30" />
        <div className="rounded-xl border p-5 h-96 bg-muted/30" />
      </div>
    }>
      <TransazioniContent />
    </Suspense>
  );
}
