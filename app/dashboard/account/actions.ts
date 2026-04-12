"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function deleteAccount() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    return { error: "Non autenticato." };
  }

  const userId = data.claims.sub;

  // Need service role to delete a user from auth.users
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    return { error: "Errore durante l'eliminazione. Riprova." };
  }

  // Sign out and redirect
  await supabase.auth.signOut();
  redirect("/auth/login?deleted=1");
}
