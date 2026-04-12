import Link from "next/link";
import { Suspense } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LogoutButton } from "@/components/logout-button";
import { siteConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

async function DashboardNav() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  const isAdmin = data?.claims?.email
    ? adminEmails.includes(data.claims.email as string)
    : false;

  return (
    <div className="w-full max-w-5xl flex justify-between items-center px-5 text-sm">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-bold text-lg">
          {siteConfig.name}
        </Link>
        <div className="hidden md:flex items-center gap-4 text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <Link href="/dashboard/transazioni" className="hover:text-foreground transition-colors">
            Transazioni
          </Link>
          <Link href="/dashboard/obiettivi" className="hover:text-foreground transition-colors">
            Obiettivi
          </Link>
          <Link href="/dashboard/account" className="hover:text-foreground transition-colors">
            Impostazioni
          </Link>
          {isAdmin && (
            <Link href="/dashboard/admin" className="hover:text-foreground transition-colors text-amber-600 dark:text-amber-400">
              Admin
            </Link>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ThemeSwitcher />
        <LogoutButton />
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 sticky top-0 bg-background/80 backdrop-blur-sm z-50">
          <Suspense fallback={
            <div className="w-full max-w-5xl flex justify-between items-center px-5">
              <div className="h-6 w-32 rounded bg-muted animate-pulse" />
              <div className="h-8 w-20 rounded bg-muted animate-pulse" />
            </div>
          }>
            <DashboardNav />
          </Suspense>
        </nav>

        <div className="flex-1 w-full max-w-5xl px-5 py-10 pb-20">
          {children}
        </div>
      </div>
    </main>
  );
}
