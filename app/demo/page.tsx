"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";

export default function DemoPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      // Ricarica i dati demo (best-effort: se fallisce si prosegue comunque)
      try {
        await fetch("/api/demo/reset", { method: "POST" });
      } catch {
        /* ignore */
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });

      if (signInError) {
        setError(true);
        return;
      }
      router.replace("/dashboard");
    })();
  }, [router]);

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? (
        <>
          <p className="text-lg font-semibold">Demo non disponibile al momento</p>
          <p className="text-sm text-muted-foreground">
            Riprova tra poco oppure registrati per creare il tuo account.
          </p>
          <Link
            href="/auth/sign-up"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Registrati gratis
          </Link>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Preparo la demo…</p>
        </>
      )}
    </div>
  );
}
