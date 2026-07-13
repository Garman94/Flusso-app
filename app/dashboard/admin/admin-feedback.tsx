"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type FeedbackMsg = {
  id: string;
  user_id: string;
  body: string;
  is_admin: boolean;
  created_at: string;
};

type UserThread = {
  user_id: string;
  name: string;
  messages: FeedbackMsg[];
  lastAt: string;
};

type Profile = { id: string; full_name: string | null };

export function AdminFeedback({ profiles }: { profiles: Profile[] }) {
  const supabase = createClient();
  const [threads, setThreads] = useState<UserThread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data, error } = await supabase
      .from("feedback_messages")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { setLoading(false); return; }

    const msgs = (data ?? []) as FeedbackMsg[];
    const map = new Map<string, FeedbackMsg[]>();
    for (const m of msgs) {
      if (!map.has(m.user_id)) map.set(m.user_id, []);
      map.get(m.user_id)!.push(m);
    }

    const nameMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name ?? "Utente"]));
    const result: UserThread[] = [];
    map.forEach((messages, user_id) => {
      result.push({
        user_id,
        name: nameMap[user_id] ?? user_id.slice(0, 8),
        messages,
        lastAt: messages[messages.length - 1].created_at,
      });
    });
    result.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    setThreads(result);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected, threads]);

  async function sendReply() {
    if (!reply.trim() || !selected) return;
    setSending(true);
    const { error } = await supabase.from("feedback_messages").insert({
      user_id: selected,
      body: reply.trim(),
      is_admin: true,
    });
    if (error) {
      toast.error("Errore nell'invio");
    } else {
      setReply("");
      await load();
    }
    setSending(false);
  }

  const activeThread = threads.find((t) => t.user_id === selected);

  if (loading) return <p className="text-sm text-muted-foreground">Caricamento feedback…</p>;

  if (threads.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center">
        <span className="text-3xl">📭</span>
        <p className="text-sm text-muted-foreground mt-2">Nessun messaggio dagli utenti ancora.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden flex" style={{ height: 480 }}>
      {/* sidebar utenti */}
      <div className="w-48 shrink-0 border-r flex flex-col overflow-y-auto bg-muted/20">
        {threads.map((t) => {
          const unread = t.messages.filter((m) => !m.is_admin).length;
          return (
            <button
              key={t.user_id}
              onClick={() => setSelected(t.user_id)}
              className={`text-left px-3 py-3 border-b text-sm transition-colors flex flex-col gap-0.5 ${
                selected === t.user_id ? "bg-primary/10 font-medium" : "hover:bg-muted/50"
              }`}
            >
              <span className="truncate">{t.name}</span>
              <span className="text-xs text-muted-foreground">
                {unread} mess. user · {t.messages.length} tot.
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(t.lastAt).toLocaleDateString("it-IT")}
              </span>
            </button>
          );
        })}
      </div>

      {/* chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeThread ? (
          <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
            Seleziona un utente
          </div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b text-sm font-medium shrink-0">
              {activeThread.name}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {activeThread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.is_admin ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.is_admin
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`text-[10px] mt-1 opacity-50 ${m.is_admin ? "text-right" : "text-left"}`}>
                      {new Date(m.created_at).toLocaleString("it-IT", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="border-t px-3 py-2 flex gap-2 items-end shrink-0">
              <textarea
                className="flex-1 resize-none text-sm bg-transparent outline-none py-1.5 max-h-24 min-h-[2.5rem] placeholder:text-muted-foreground"
                placeholder="Risposta… (Invio per inviare)"
                rows={1}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              />
              <button
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                className="shrink-0 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {sending ? "…" : "Invia"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
