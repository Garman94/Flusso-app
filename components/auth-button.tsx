import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    user = data?.claims ?? null;
  } catch {
    // fail gracefully — show login buttons
  }

  return user ? (
    <div className="flex items-center gap-4">
      <Link href="/dashboard">
        <Button size="sm" variant="outline">Dashboard</Button>
      </Link>
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/login">Accedi</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/auth/sign-up">Registrati</Link>
      </Button>
    </div>
  );
}
