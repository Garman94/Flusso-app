// Eventi d'uso first-party (tabella `events`, migration 035). Solo lato client.
//
// Regole: niente importi né descrizioni dei movimenti in `props`; mai bloccare o
// rompere la UI per una metrica (ogni errore, inclusa la tabella non ancora creata,
// viene ignorato); la demo non viene tracciata.
import { createClient } from "@/lib/supabase/client";

export type EventProps = Record<string, string | number | boolean | null>;

export async function track(name: string, props: EventProps = {}): Promise<void> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL;
    if (demoEmail && user.email === demoEmail) return;
    await supabase.from("events").insert({ user_id: user.id, name, props });
  } catch {
    // le metriche non devono mai rompere l'app
  }
}

/** Come track(), ma al massimo una volta ogni `everyMs` per browser e per chiave. */
export function trackThrottled(name: string, props: EventProps, everyMs: number, key: string = name): void {
  try {
    const storageKey = `flusso_evt:${key}`;
    const last = Number(localStorage.getItem(storageKey) ?? 0);
    if (Date.now() - last < everyMs) return;
    localStorage.setItem(storageKey, String(Date.now()));
  } catch {
    // localStorage non disponibile: si traccia comunque
  }
  void track(name, props);
}
