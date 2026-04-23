"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { isAdmin: boolean };

const NAV_LINKS = [
  { href: "/dashboard",              label: "Dashboard",     exact: true  },
  { href: "/dashboard/transazioni",  label: "Transazioni",   exact: false },
  { href: "/dashboard/smart",        label: "Budget",        exact: false },
  { href: "/dashboard/account",      label: "Impostazioni",  exact: false },
];

export function DashboardNavLinks({ isAdmin }: Props) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex items-center gap-4">
        {NAV_LINKS.map(({ href, label, exact }) => (
          <Link
            key={href}
            href={href}
            className={`transition-colors text-sm ${
              isActive(href, exact)
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/dashboard/admin"
            className={`transition-colors text-sm ${
              isActive("/dashboard/admin", false)
                ? "text-amber-600 dark:text-amber-400 font-semibold"
                : "text-amber-600/60 dark:text-amber-400/60 hover:text-amber-600 dark:hover:text-amber-400"
            }`}
          >
            Admin
          </Link>
        )}
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t flex items-center justify-around h-16 px-2">

        <Link href="/dashboard" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard", true) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard", true) ? 2.2 : 1.8}>
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="text-[10px]">Dashboard</span>
        </Link>

        <Link href="/dashboard/transazioni" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard/transazioni", false) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard/transazioni", false) ? 2.2 : 1.8}>
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span className="text-[10px]">Transazioni</span>
        </Link>

        <Link href="/dashboard/smart" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard/smart", false) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard/smart", false) ? 2.2 : 1.8}>
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span className="text-[10px]">Budget</span>
        </Link>

        <Link href="/dashboard/account" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard/account", false) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard/account", false) ? 2.2 : 1.8}>
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          <span className="text-[10px]">Account</span>
        </Link>

        {isAdmin && (
          <Link href="/dashboard/admin" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard/admin", false) ? "text-amber-600 dark:text-amber-400" : "text-amber-600/50 dark:text-amber-400/50 hover:text-amber-600 dark:hover:text-amber-400"}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard/admin", false) ? 2.2 : 1.8}>
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
            </svg>
            <span className="text-[10px]">Admin</span>
          </Link>
        )}

      </nav>
    </>
  );
}
