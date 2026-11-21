"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { removePushDevice } from "@/app/actions/push";

/**
 * Uscendo si spengono le notifiche di questo dispositivo: su un telefono o computer condiviso non
 * arrivano a chi entra dopo. Va fatto prima di uscire (il server deve sapere chi è).
 */
async function stopPushOnThisDevice(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await removePushDevice(sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // uscire conta di più: le notifiche di un dispositivo sparito le toglie il primo invio fallito
  }
}

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await Promise.race([stopPushOnThisDevice(), new Promise(r => setTimeout(r, 1500))]);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return <Button onClick={logout} variant="outline" size="sm" className="h-11">Esci</Button>;
}
