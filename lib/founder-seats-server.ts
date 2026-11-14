// Solo lato server (usa la service role): quanti account hanno già il piano Founder.
import { unstable_cache } from "next/cache";
import { createServiceClient } from "./supabase/service";
import { founderSeatsInfo, type FounderSeats } from "./founder-seats";

/** Numero di profili con piano founder; null se il database non risponde o manca la chiave. */
async function countFounders(): Promise<number | null> {
  try {
    const { count, error } = await createServiceClient()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("plan", "founder");
    return error || count === null ? null : count;
  } catch {
    return null;
  }
}

// Landing e prezzi la leggono a ogni visita: un conteggio vecchio di un'ora va benissimo.
const cachedCount = unstable_cache(countFounders, ["founder-seats-taken"], { revalidate: 3600 });

export async function getFounderSeats(): Promise<FounderSeats> {
  return founderSeatsInfo(await cachedCount().catch(() => null));
}
