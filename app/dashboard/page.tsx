import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPlanLabel, getPlanBadgeColor, isPremium } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

async function DashboardContent() {
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

  const plan = profile?.plan ?? "free";
  const userIsPremium = isPremium(plan);

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          Ciao{profile?.full_name ? `, ${profile.full_name}` : ""}!
        </h1>
        <p className="text-muted-foreground mt-1">{data.claims.email}</p>
      </div>

      {/* Plan card */}
      <div className="rounded-xl border p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Il tuo piano</h2>
          <Badge className={cn("text-sm", getPlanBadgeColor(plan))}>
            {getPlanLabel(plan)}
          </Badge>
        </div>

        {userIsPremium ? (
          <p className="text-sm text-muted-foreground">
            Hai accesso a tutte le funzionalità premium.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Sei sul piano gratuito. Fai l&apos;upgrade per sbloccare tutte le funzionalità.
            </p>
            {process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL && (
              <a
                href={process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL}
                className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 w-fit"
              >
                Passa a Premium
              </a>
            )}
          </div>
        )}
      </div>

      {/* Account info */}
      <div className="rounded-xl border p-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="text-sm flex flex-col gap-2">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Email</span>
            <span>{data.claims.email}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs">{data.claims.sub}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Piano</span>
            <span>{getPlanLabel(plan)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-10 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-9 w-48 rounded bg-muted" />
        <div className="h-4 w-64 rounded bg-muted" />
      </div>
      <div className="rounded-xl border p-6 h-32 bg-muted/30" />
      <div className="rounded-xl border p-6 h-40 bg-muted/30" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
