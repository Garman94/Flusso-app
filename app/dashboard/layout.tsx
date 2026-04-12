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
        {/* Top nav */}
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

        {/* Page content — extra bottom padding on mobile for the bottom nav */}
        <div className="flex-1 w-full max-w-5xl px-4 py-6 pb-24 md:px-5 md:py-10 md:pb-20">
          {children}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t flex items-center justify-around h-16 px-2">
        <Link href="/dashboard" className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors py-1 px-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="text-[10px]">Dashboard</span>
        </Link>
        <Link href="/dashboard/transazioni" className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors py-1 px-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span className="text-[10px]">Transazioni</span>
        </Link>
        <Link href="/dashboard/obiettivi" className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors py-1 px-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
          </svg>
          <span className="text-[10px]">Obiettivi</span>
        </Link>
        <Link href="/dashboard/account" className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors py-1 px-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          <span className="text-[10px]">Account</span>
        </Link>
      </nav>
    </main>
  );
}
