"use server";

import { unsubscribe } from "@/lib/email-unsubscribe";

export async function confirmUnsubscribe(u: string, k: string, t: string): Promise<{ ok: boolean }> {
  return { ok: await unsubscribe(u, k, t) };
}
