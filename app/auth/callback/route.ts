import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { safeNext } from "@/lib/auth-return";

/**
 * OAuth callback route — handles the code exchange after Google (or other provider) login.
 * Supabase redirects here with ?code=... after the user authenticates. From the Android app it arrives
 * through it.flussoapp://auth/callback, reopened here by MainActivity (see lib/auth-return.ts).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), request.url);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }

    return NextResponse.redirect(
      new URL(`/auth/error?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }

  // accesso annullato o rifiutato: Supabase torna con error_description invece del codice
  const reason = searchParams.get("error_description") ?? "No code provided";
  return NextResponse.redirect(
    new URL(`/auth/error?error=${encodeURIComponent(reason)}`, request.url),
  );
}
