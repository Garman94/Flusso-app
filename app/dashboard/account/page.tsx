import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/preview-plan";
import { getPlanLabel, getPlanBadgeColor } from "@/lib/plans";
import { UpdateNameForm } from "./update-name-form";
import { DeleteAccountButton } from "./delete-account-button";
import { PlanSection } from "./plan-section";
import { UpgradeSuccessModal } from "./upgrade-success-modal";

async function AccountContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.claims.sub)
    .single();

  const plan = await getEffectivePlan(profile?.plan ?? "free");
  const checkoutUrl = process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL ?? null;

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Impostazioni account</h1>
        <p className="text-muted-foreground mt-1">Gestisci il tuo profilo e l&apos;abbonamento.</p>
      </div>

      {/* Profile */}
      <div className="rounded-xl border p-6 flex flex-col gap-6">
        <h2 className="font-semibold">Profilo</h2>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Email</label>
          <p className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/50">
            {data.claims.email}
          </p>
        </div>

        <UpdateNameForm currentName={profile?.full_name ?? ""} userId={data.claims.sub} />
      </div>

      {/* Plan — client component to handle coupon redemption + checkout */}
      <PlanSection
        plan={plan}
        userId={data.claims.sub}
        checkoutUrl={checkoutUrl}
        planLabel={getPlanLabel(plan)}
        planBadgeColor={getPlanBadgeColor(plan)}
      />

      {/* Delete account */}
      <div className="rounded-xl border border-destructive/30 p-6 flex flex-col gap-4">
        <h2 className="font-semibold text-destructive">Elimina il tuo account</h2>
        <p className="text-sm text-muted-foreground">
          Una volta eliminato, il tuo account e tutti i dati associati verranno rimossi definitivamente. Questa azione non può essere annullata.
        </p>
        <DeleteAccountButton hasPlan={plan !== "free"} />
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <>
      <Suspense fallback={null}>
        <UpgradeSuccessModal />
      </Suspense>
      <Suspense fallback={
      <div className="flex flex-col gap-8 max-w-2xl animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="rounded-xl border p-6 h-40 bg-muted/30" />
        <div className="rounded-xl border p-6 h-48 bg-muted/30" />
        <div className="rounded-xl border p-6 h-24 bg-muted/30" />
      </div>
    }>
      <AccountContent />
    </Suspense>
    </>
  );
}
