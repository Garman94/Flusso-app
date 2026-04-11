import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlanLabel, getPlanBadgeColor } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UpdateNameForm } from "./update-name-form";
import { AvatarUpload } from "@/components/avatar-upload";

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

  const plan = profile?.plan ?? "free";

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Impostazioni account</h1>
        <p className="text-muted-foreground mt-1">Gestisci il tuo profilo e l&apos;abbonamento.</p>
      </div>

      {/* Profile */}
      <div className="rounded-xl border p-6 flex flex-col gap-6">
        <h2 className="font-semibold">Profilo</h2>

        <AvatarUpload
          userId={data.claims.sub}
          currentAvatarUrl={profile?.avatar_url ?? null}
          fullName={profile?.full_name ?? null}
        />

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Email</label>
          <p className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/50">
            {data.claims.email}
          </p>
        </div>

        <UpdateNameForm currentName={profile?.full_name ?? ""} userId={data.claims.sub} />
      </div>

      {/* Plan */}
      <div className="rounded-xl border p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Piano di abbonamento</h2>
          <Badge className={cn("text-sm", getPlanBadgeColor(plan))}>
            {getPlanLabel(plan)}
          </Badge>
        </div>

        {plan === "free" ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">
            Hai un abbonamento {getPlanLabel(plan)} attivo.
          </p>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/30 p-6 flex flex-col gap-4">
        <h2 className="font-semibold text-destructive">Zona pericolosa</h2>
        <p className="text-sm text-muted-foreground">
          Per eliminare il tuo account, contatta il supporto.
        </p>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-8 max-w-2xl animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="rounded-xl border p-6 h-40 bg-muted/30" />
        <div className="rounded-xl border p-6 h-32 bg-muted/30" />
      </div>
    }>
      <AccountContent />
    </Suspense>
  );
}
