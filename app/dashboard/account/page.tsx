import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/preview-plan";
import { getPlanLabel, getPlanBadgeColor, trialDaysLeft } from "@/lib/plans";
import { UpdateNameForm } from "./update-name-form";
import { DeleteAccountButton } from "./delete-account-button";
import { PlanSection } from "./plan-section";
import { UpgradeSuccessModal } from "./upgrade-success-modal";
import { FamilyMembersSection } from "./family-members-section";
import { IncomeSection } from "./income-section";
import { PowerUserToggle } from "./power-user-toggle";
import { FeedbackChat } from "./feedback-chat";
import { PageTour } from "@/components/tour/page-tour";

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

  const { data: ownerMember } = await supabase
    .from("family_members")
    .select("name")
    .eq("user_id", data.claims.sub)
    .eq("is_owner", true)
    .maybeSingle();

  const plan = await getEffectivePlan(profile?.plan ?? "free", profile?.trial_ends_at);
  const checkoutUrl = process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL ?? null;

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <Suspense><PageTour path="/dashboard/account" /></Suspense>
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
        hasSubscription={!!profile?.lemon_squeezy_subscription_id}
        trialDaysLeft={profile?.plan === "free" ? trialDaysLeft(profile?.trial_ends_at) : 0}
        premiumEndsAt={profile?.premium_ends_at ?? null}
      />

      {/* Owner income — nascosto se il titolare si e' identificato come Componente */}
      <div data-tour="account-income">
      {ownerMember ? (
        <div className="rounded-xl border p-6 flex flex-col gap-2">
          <h2 className="font-semibold">Il tuo reddito</h2>
          <p className="text-sm text-muted-foreground">
            Ti sei identificato come <strong className="text-foreground">{ownerMember.name}</strong> tra i
            Componenti qui sotto: gestisci il tuo reddito da lì invece che qui, per evitare di contarlo due volte.
          </p>
        </div>
      ) : (
        <IncomeSection
          ownerName={profile?.full_name ?? ""}
          initial={{
            income_type: profile?.income_type ?? null,
            monthly_income: profile?.monthly_income ?? null,
            income_frequency: profile?.income_frequency ?? null,
            income_payday: profile?.income_payday ?? null,
            income_variability: profile?.income_variability ?? null,
            active_months: profile?.active_months ?? [],
          }}
        />
      )}
      </div>

      {/* Family members */}
      <div data-tour="account-family">
        <FamilyMembersSection userId={data.claims.sub} />
      </div>

      {/* Power user toggle */}
      <div data-tour="account-power-user">
        <PowerUserToggle userId={data.claims.sub} enabled={profile?.power_user ?? false} />
      </div>

      {/* Feedback */}
      <div data-tour="account-feedback">
        <FeedbackChat userId={data.claims.sub} />
      </div>

      {/* Export dati */}
      <div className="rounded-xl border p-6 flex flex-col gap-3">
        <h2 className="font-semibold">Esporta i tuoi movimenti</h2>
        <p className="text-sm text-muted-foreground">
          Scarica tutte le tue transazioni in un file CSV (si apre con Excel). I tuoi dati restano tuoi.
        </p>
        <a
          href="/api/export"
          download
          className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/50 w-fit transition-colors"
        >
          Scarica il CSV
        </a>
      </div>

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
