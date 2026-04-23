"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const PREVIEW_COOKIE = "preview_plan";

async function assertAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  if (!data?.claims?.email || !adminEmails.includes(data.claims.email as string)) {
    throw new Error("Unauthorized");
  }
}

export async function setPreviewPlan(plan: string) {
  await assertAdmin();
  const cookieStore = await cookies();
  cookieStore.set(PREVIEW_COOKIE, plan, {
    path: "/",
    maxAge: 60 * 60 * 8,
    httpOnly: false,
    sameSite: "lax",
  });
}

export async function clearPreviewPlan() {
  await assertAdmin();
  const cookieStore = await cookies();
  cookieStore.delete(PREVIEW_COOKIE);
}
