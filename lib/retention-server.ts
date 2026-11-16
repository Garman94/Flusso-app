// Solo lato server (service role): legge iscritti e visite per la card «Chi torna» in Admin.
// Le email servono solo a togliere admin e demo dal conto: non escono da qui.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "./admin-emails";
import { isDemoEmail } from "./demo";
import {
  userReturns, returnSummary, weeklyActive, activeInLastDays,
  type RetentionUser, type Visit, type UserReturn, type ReturnSummary, type WeekRow,
} from "./retention";

export type RetentionData = {
  rows: UserReturn[];
  summary: ReturnSummary;
  weeks: WeekRow[];
  last7: { current: number; previous: number };
  trackingSince: string | null;
  now: string;
};

const PAGE = 1000;
const MAX_PAGES = 50; // fino a 50.000 visite: ben oltre quello che serve oggi

/** null se la tabella degli eventi manca o il database non risponde: la card allora non compare. */
export async function loadRetention(service: SupabaseClient): Promise<RetentionData | null> {
  try {
    const { data: profiles } = await service.from("profiles").select("id, full_name");
    const names = new Map<string, string | null>((profiles ?? []).map(p => [p.id as string, p.full_name as string | null]));
    const users: RetentionUser[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) return null;
      for (const u of data.users) {
        const email = (u.email ?? "").toLowerCase();
        if (isAdminEmail(email) || isDemoEmail(email)) continue;
        users.push({ id: u.id, name: names.get(u.id) ?? null, createdAt: u.created_at });
      }
      if (data.users.length < PAGE) break;
    }

    // Tutte le visite (anche dell'admin): la prima dice da quando Flusso le conta.
    const visits: Visit[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await service
        .from("events")
        .select("user_id, created_at")
        .eq("name", "app_open")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }) // a parità di ora l'ordine resta fisso tra una pagina e l'altra
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) return null;
      for (const e of data ?? []) visits.push({ userId: e.user_id as string, at: e.created_at as string });
      if (!data || data.length < PAGE) break;
    }

    const now = new Date();
    const trackingSince = visits[0]?.at ?? null;
    const rows = userReturns(users, visits, now, trackingSince);
    return {
      rows,
      summary: returnSummary(rows),
      weeks: weeklyActive(users, visits, now),
      last7: activeInLastDays(users, visits, now),
      trackingSince,
      now: now.toISOString(),
    };
  } catch {
    return null;
  }
}
