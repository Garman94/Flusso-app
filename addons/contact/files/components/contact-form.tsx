"use client";

import { useState } from "react";
import { toast } from "sonner";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Qualcosa è andato storto. Riprova.");
        return;
      }

      setSubmitted(true);
      toast.success("Messaggio inviato! Ti risponderemo presto.");
    } catch {
      toast.error("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="text-4xl">✉️</div>
        <p className="font-semibold text-lg">Messaggio inviato!</p>
        <p className="text-muted-foreground text-sm">
          Ti risponderemo all&apos;indirizzo <strong>{email}</strong> il prima possibile.
        </p>
        <button
          onClick={() => { setSubmitted(false); setName(""); setEmail(""); setMessage(""); }}
          className="text-sm text-primary hover:underline mt-2"
        >
          Invia un altro messaggio
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-lg">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">Nome</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mario Rossi"
          required
          className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mario@esempio.com"
          required
          className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-sm font-medium">Messaggio</label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Come possiamo aiutarti?"
          required
          rows={5}
          maxLength={2000}
          className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">
          {message.length}/2000
        </p>
      </div>

      <button
        type="submit"
        disabled={loading || !name.trim() || !email.trim() || !message.trim()}
        className="bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Invio in corso..." : "Invia messaggio"}
      </button>
    </form>
  );
}
