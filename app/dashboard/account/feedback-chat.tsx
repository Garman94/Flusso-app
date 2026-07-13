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

export function FeedbackChat({ userId }: { userId: string }) {
  const supabase = createClient();
  const [messages, setMessages] = useState<FeedbackMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data, error } = await supabase
      .from("feedback_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (!error) setMessages(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    const { error } = await supabase.from("feedback_messages").insert({
      user_id: userId,
      body: text,
      is_admin: false,
    });
    if (error) {
      toast.error("Errore nell'invio del messaggio");
    } else {
      setBody("");
      await load();
    }
    setSending(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="rounded-xl border flex flex-col" style={{ height: 420 }}>
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <span className="text-base">💬</span>
        <div>
          <p className="font-semibold text-sm">Scrivi a Marco</p>
          <p className="text-xs text-muted-foreground">Idee, problemi o domande — rispondo direttamente qui.</p>
        </div>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {loading && (
          <p className="text-xs text-muted-foreground text-center mt-4">Caricamento…</p>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center py-8">
            <span className="text-3xl">✉️</span>
            <p className="text-sm text-muted-foreground">Nessun messaggio ancora.<br />Scrivimi un&apos;idea o un problema!</p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.is_admin ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.is_admin
                  ? "bg-muted text-foreground rounded-tl-sm"
                  : "bg-primary text-primary-foreground rounded-tr-sm"
              }`}
            >
              {m.is_admin && (
                <p className="text-[10px] font-semibold mb-0.5 opacity-60">Marco</p>
              )}
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`text-[10px] mt-1 opacity-50 ${m.is_admin ? "text-left" : "text-right"}`}>
                {new Date(m.created_at).toLocaleString("it-IT", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="border-t px-3 py-2 flex gap-2 items-end">
        <textarea
          className="flex-1 resize-none text-sm bg-transparent outline-none py-1.5 max-h-28 min-h-[2.5rem] placeholder:text-muted-foreground"
          placeholder="Scrivi un messaggio… (Invio per inviare)"
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="shrink-0 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          {sending ? "…" : "Invia"}
        </button>
      </div>
    </div>
  );
}
