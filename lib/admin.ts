/**
 * Admin utilities — server-side only, uses the service role key to bypass RLS.
 * NEVER import this in client components.
 */
import { createClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plans";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set",
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Manually update a user's plan.
 * For admin use only — e.g. in a Server Action or API route protected by admin auth.
 *
 * @param userId  - The user's UUID (from auth.users)
 * @param plan    - One of 'free' | 'premium' | 'founder'
 */
export async function updateUserPlan(
  userId: string,
  plan: Plan,
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to update plan for ${userId}: ${error.message}`);
  }
}
