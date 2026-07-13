import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import Link from "next/link";
import { AdminCouponManager } from "./admin-coupon-manager";
import { AdminPreviewMode } from "./admin-preview-mode";
import { AdminUsersSection } from "./admin-users-section";
import { AdminFeedback } from "./admin-feedback";
import { getPreviewPlan } from "@/lib/preview-plan";

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function AdminContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/auth/login");

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(data.claims.email as string)) {
    redirect("/dashboard");
  }

  const service = getServiceClient();

  const [{ data: profiles, error: profilesError }, { data: coupons }, previewPlan] = await Promise.all([
    service
      .from("profiles")
      .select("id, full_name, plan, created_at")
      .order("created_at", { ascending: false }),
    service
      .from("coupon_codes")
      .select("id, code, plan, used, used_by, used_at, notes, created_at")
      .order("created_at", { ascending: false }),
    getPreviewPlan(),
  ]);

  if (profilesError) {
    return <p className="text-destructive text-sm">Errore nel caricamento utenti: {profilesError.message}</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground mt-1">{profiles?.length ?? 0} utenti registrati</p>
        </div>
        <Link
          href="/onboarding?preview=1"
          target="_blank"
          className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
        >
          <span>👀</span>
          Test primo utilizzo
        </Link>
      </div>

      {/* Users table */}
      <AdminUsersSection profiles={profiles ?? []} />

      {/* Coupon manager */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Coupon di upgrade</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Genera codici monouso da inviare manualmente agli utenti.
          </p>
        </div>
        <AdminCouponManager initialCoupons={coupons ?? []} />
      </div>

      {/* Feedback utenti */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Feedback utenti</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Messaggi inviati dagli utenti dall&apos;app. Rispondi direttamente qui.
          </p>
        </div>
        <AdminFeedback profiles={profiles?.map((p) => ({ id: p.id, full_name: p.full_name })) ?? []} />
      </div>

      {/* Preview mode */}
      <AdminPreviewMode activePlan={previewPlan} />
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-8 animate-pulse">
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="rounded-xl border h-64 bg-muted/30" />
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}
