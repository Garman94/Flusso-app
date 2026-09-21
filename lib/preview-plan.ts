import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolvePlan } from "@/lib/plans";

const PREVIEW_COOKIE = "preview_plan";
const VALID_PLANS = ["free", "premium", "founder"] as const;

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  return adminEmails.includes(data.claims.email as string);
}

export async function getPreviewPlan(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(PREVIEW_COOKIE)?.value;
  if (!value || !VALID_PLANS.includes(value as (typeof VALID_PLANS)[number])) return null;
  if (!(await isAdmin())) return null;
  return value;
}

/** Piano da usare per i permessi: anteprima admin, altrimenti piano reale con eventuale prova Premium attiva. */
export async function getEffectivePlan(realPlan: string, trialEndsAt?: string | null): Promise<string> {
  const preview = await getPreviewPlan();
  return preview ?? resolvePlan(realPlan, trialEndsAt);
}
