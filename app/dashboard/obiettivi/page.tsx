import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ObiettiviClient } from "./obiettivi-client";

async function ObiettiviContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const userId = data.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (
    <ObiettiviClient
      userId={userId}
      plan={profile?.plan ?? "free"}
      initialGoals={goals ?? []}
    />
  );
}

export default function ObiettiviPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="rounded-xl border p-5 h-40 bg-muted/30" />)}
        </div>
      </div>
    }>
      <ObiettiviContent />
    </Suspense>
  );
}
