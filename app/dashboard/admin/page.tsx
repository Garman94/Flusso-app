import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getPlanLabel, getPlanBadgeColor } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AdminPlanSelect } from "./admin-plan-select";
import { AdminCouponManager } from "./admin-coupon-manager";
import { AdminPreviewMode } from "./admin-preview-mode";
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
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground mt-1">
          {profiles?.length ?? 0} utenti registrati
        </p>
      </div>

      {/* Users table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Utente</th>
              <th className="text-left px-4 py-3 font-medium">Piano</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Registrato</th>
              <th className="text-left px-4 py-3 font-medium">Azione</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {profiles?.map((profile) => (
              <tr key={profile.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{profile.full_name || "—"}</span>
                    <span className="text-xs text-muted-foreground font-mono">{profile.id.slice(0, 8)}…</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn("text-xs", getPlanBadgeColor(profile.plan))}>
                    {getPlanLabel(profile.plan)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  {new Date(profile.created_at).toLocaleDateString("it-IT")}
                </td>
                <td className="px-4 py-3">
                  <AdminPlanSelect userId={profile.id} currentPlan={profile.plan} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
