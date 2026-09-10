import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTour } from "@/components/tour/page-tour";
import { SalvadanaiClient } from "./salvadanai-client";
import type { SavingsPot, SavingsPotMember, SavingsTransaction } from "@/lib/savings";

async function SalvadanaiContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const userId = data.claims.sub;

  const [potsRes, membersRes, potMembersRes, txRes] = await Promise.all([
    supabase.from("savings_pots").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("family_members").select("id, name, color").eq("user_id", userId).order("created_at"),
    supabase.from("savings_pot_members").select("id, pot_id, member_id, contributed_amount"),
    supabase
      .from("savings_transactions")
      .select("id, pot_id, member_id, amount, type, note, date, created_at")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(200),
  ]);

  return (
    <SalvadanaiClient
      userId={userId}
      initialPots={(potsRes.data ?? []) as SavingsPot[]}
      familyMembers={(membersRes.data ?? []) as { id: string; name: string; color: string }[]}
      potMembers={(potMembersRes.data ?? []) as SavingsPotMember[]}
      initialTransactions={(txRes.data ?? []) as SavingsTransaction[]}
    />
  );
}

export default function SalvadanaiPage() {
  return (
    <>
      <Suspense><PageTour path="/dashboard/salvadanai" /></Suspense>
      <Suspense fallback={
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border p-5 h-40 bg-muted/30" />
            <div className="rounded-xl border p-5 h-40 bg-muted/30" />
          </div>
        </div>
      }>
        <SalvadanaiContent />
      </Suspense>
    </>
  );
}
