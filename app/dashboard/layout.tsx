import Link from "next/link";
import { Suspense } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LogoutButton } from "@/components/logout-button";
import { DashboardNavLinks } from "@/components/dashboard-nav-links";
import { PreviewBanner } from "@/components/preview-banner";
import { siteConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getPreviewPlan } from "@/lib/preview-plan";

async function DashboardNav() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  const isAdmin = data?.claims?.email
    ? adminEmails.includes(data.claims.email as string)
    : false;

  const previewPlan = isAdmin ? await getPreviewPlan() : null;

  return (
    <>
      {previewPlan && <PreviewBanner currentPreview={previewPlan} />}
      <div className="w-full max-w-5xl flex justify-between items-center px-5 text-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg">
            {siteConfig.name}
          </Link>
          <DashboardNavLinks isAdmin={isAdmin} />
        </div>
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <LogoutButton />
        </div>
      </div>
    </>
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
        <div className="flex-1 w-full max-w-5xl px-4 py-6 pb-24 md:px-5 md:py-10 md:pb-10">
          {children}
        </div>
      </div>

    </main>
  );
}
