/**
 * Client Supabase con service role: bypassa RLS. SOLO lato server
 * (route handler, server action, server component). Mai in componenti client.
 */
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
