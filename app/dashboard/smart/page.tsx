import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SmartPageClient } from "./smart-page-client";

async function SmartContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const userId = data.claims.sub;

  const [profileRes, goalsRes, transactionsRes, categoriesRes] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", userId).single(),
    supabase.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("transactions").select("date, amount, category_id, description, merchant").eq("user_id", userId),
    supabase.from("categories").select("id, name, color, icon").or(`user_id.eq.${userId},user_id.is.null`).order("name"),
  ]);

  return (
    <SmartPageClient
      userId={userId}
      plan={profileRes.data?.plan ?? "free"}
      initialGoals={goalsRes.data ?? []}
      transactions={transactionsRes.data ?? []}
      categories={categoriesRes.data ?? []}
    />
  );
}

export default function SmartPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="rounded-xl border p-5 h-32 bg-muted/30" />
        <div className="rounded-xl border p-5 h-64 bg-muted/30" />
      </div>
    }>
      <SmartContent />
    </Suspense>
  );
}
