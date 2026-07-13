"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useTour } from "@/components/tour/tour-context";
import { PAGE_TOURS, hasUnseenTour, markTourSeen } from "@/lib/tour-steps";

type Props = { isAdmin: boolean };

const NAV_LINKS = [
  { href: "/dashboard",             label: "Dashboard",    exact: true  },
  { href: "/dashboard/transazioni", label: "Transazioni",  exact: false },
  { href: "/dashboard/smart",       label: "Smart",        exact: false },
  { href: "/dashboard/account",     label: "Impostazioni", exact: false },
];

// Percorsi che hanno un tour definito
const TOUR_PATHS = Object.keys(PAGE_TOURS);

export function DashboardNavLinks({ isAdmin }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const { start } = useTour();

  // mappa path → ha tour non visto
  const [unseenMap, setUnseenMap] = useState<Record<string, boolean>>({});

  const refreshUnseen = useCallback(() => {
    const map: Record<string, boolean> = {};
    for (const p of TOUR_PATHS) map[p] = hasUnseenTour(p);
    setUnseenMap(map);
  }, []);

  useEffect(() => {
    refreshUnseen();
    // aggiorna quando localStorage cambia (tour completato in altro tab)
    window.addEventListener("storage", refreshUnseen);
    return () => window.removeEventListener("storage", refreshUnseen);
  }, [refreshUnseen]);

  // quando si completa un tour, aggiorna i pallini
  useEffect(() => {
    const handler = () => refreshUnseen();
    window.addEventListener("flusso_tour_done", handler);
    return () => window.removeEventListener("flusso_tour_done", handler);
  }, [refreshUnseen]);

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function handleDot(e: React.MouseEvent, href: string) {
    e.preventDefault();
    e.stopPropagation();
    const def = PAGE_TOURS[href];
    if (!def) return;
    if (isActive(href, href === "/dashboard")) {
      start(def.steps);
      markTourSeen(href);
      refreshUnseen();
    } else {
      router.push(href + "?tour=1");
    }
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex items-center gap-4">
        {NAV_LINKS.map(({ href, label, exact }) => (
          <div key={href} className="relative flex items-center">
            <Link
              href={href}
              data-tour={href === "/dashboard/transazioni" ? "nav-transazioni" : href === "/dashboard/smart" ? "nav-smart" : undefined}
              className={`transition-colors text-sm ${
                isActive(href, exact)
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Link>
            {unseenMap[href] && (
              <button
                onClick={e => handleDot(e, href)}
                className="absolute -top-1 -right-2.5 w-2 h-2 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
                title="Novità — clicca per il tutorial"
                aria-label="Tutorial aggiornato"
              />
            )}
          </div>
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

      {/* Mobile/PWA bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t flex items-center justify-around h-16 px-2">

        {/* Dashboard */}
        <div className="relative">
          <Link href="/dashboard" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard", true) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard", true) ? 2.2 : 1.8}>
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="text-[10px]">Dashboard</span>
          </Link>
          {unseenMap["/dashboard"] && (
            <button onClick={e => handleDot(e, "/dashboard")} className="absolute top-0.5 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background" aria-label="Tutorial aggiornato" />
          )}
        </div>

        {/* Transazioni */}
        <div className="relative">
          <Link href="/dashboard/transazioni" data-tour="nav-transazioni" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard/transazioni", false) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard/transazioni", false) ? 2.2 : 1.8}>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span className="text-[10px]">Transazioni</span>
          </Link>
          {unseenMap["/dashboard/transazioni"] && (
            <button onClick={e => handleDot(e, "/dashboard/transazioni")} className="absolute top-0.5 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background" aria-label="Tutorial aggiornato" />
          )}
        </div>

        {/* Smart */}
        <div className="relative">
          <Link href="/dashboard/smart" data-tour="nav-smart" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard/smart", false) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard/smart", false) ? 2.2 : 1.8}>
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="text-[10px]">Smart</span>
          </Link>
          {unseenMap["/dashboard/smart"] && (
            <button onClick={e => handleDot(e, "/dashboard/smart")} className="absolute top-0.5 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background" aria-label="Tutorial aggiornato" />
          )}
        </div>

        {/* Account */}
        <div className="relative">
          <Link href="/dashboard/account" className={`flex flex-col items-center gap-0.5 transition-colors py-1 px-3 ${isActive("/dashboard/account", false) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive("/dashboard/account", false) ? 2.2 : 1.8}>
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            <span className="text-[10px]">Account</span>
          </Link>
          {unseenMap["/dashboard/account"] && (
            <button onClick={e => handleDot(e, "/dashboard/account")} className="absolute top-0.5 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background" aria-label="Tutorial aggiornato" />
          )}
        </div>

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
