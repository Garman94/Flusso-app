import Link from "next/link";
import { Suspense } from "react";
import { AuthButton } from "./auth-button";
import { ThemeSwitcher } from "./theme-switcher";
import { siteConfig } from "@/lib/config";

export function Navbar() {
  return (
    <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 sticky top-0 bg-background/80 backdrop-blur-sm z-50">
      <div className="w-full max-w-5xl flex justify-between items-center px-5 text-sm">
        {/* Logo */}
        <Link href="/" className="font-bold text-lg">
          {siteConfig.name}
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-6">
          {siteConfig.nav.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <Suspense fallback={<div className="w-20 h-8 rounded bg-muted animate-pulse" />}>
            <AuthButton />
          </Suspense>
        </div>
      </div>
    </nav>
  );
}
