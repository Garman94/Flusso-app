"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NOTIFICATION_ICON, type AdminNotification } from "@/lib/notifications";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }

      const [{ data: profile }, { data: notifs }, { data: dismissed }] = await Promise.all([
        supabase.from("profiles").select("plan").eq("id", auth.user.id).single(),
        supabase
          .from("admin_notifications")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase.from("notification_dismissals").select("notification_id").eq("user_id", auth.user.id),
      ]);

      if (cancelled) return;
      const plan = (profile?.plan ?? "free") as string;
      const dismissedIds = new Set((dismissed ?? []).map(d => d.notification_id));
      const now = Date.now();
      const filtered = ((notifs ?? []) as AdminNotification[]).filter(n =>
        !dismissedIds.has(n.id) &&
        (n.target_plan === "all" || n.target_plan === plan) &&
        (!n.expires_at || new Date(n.expires_at).getTime() > now)
      );
      setItems(filtered);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function dismiss(id: string) {
    setItems(prev => prev.filter(n => n.id !== id));
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      await supabase.from("notification_dismissals").insert({ notification_id: id, user_id: auth.user.id });
    }
  }

  const count = items.length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted/60 transition-colors"
        aria-label="Notifiche"
        data-tour="notifications-bell"
      >
        <Bell size={16} className="text-muted-foreground" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="font-semibold text-sm">Novità e suggerimenti</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground animate-pulse">Caricamento…</div>
            ) : count === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <span className="text-2xl block mb-1">🔕</span>
                Nessuna novità
              </div>
            ) : (
              <ul className="divide-y">
                {items.map(n => (
                  <li key={n.id} className="p-3 flex gap-2.5">
                    <span className="text-lg leading-none mt-0.5">{NOTIFICATION_ICON[n.type]}</span>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                      {n.cta_text && n.cta_url && (
                        <Link
                          href={n.cta_url}
                          onClick={() => setOpen(false)}
                          className="text-xs font-medium text-primary hover:underline mt-0.5"
                        >
                          {n.cta_text} →
                        </Link>
                      )}
                    </div>
                    <button
                      onClick={() => dismiss(n.id)}
                      className="text-muted-foreground hover:text-foreground text-xs shrink-0"
                      aria-label="Ignora"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
