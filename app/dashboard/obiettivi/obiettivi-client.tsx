"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  created_at: string;
};

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

const ICONS = ["🎯", "🏖️", "🏠", "🚗", "💻", "📚", "💍", "✈️", "🎓", "💪", "🌱", "🎁"];
const FREE_GOAL_LIMIT = 1;

type Props = {
  userId: string;
  plan: string;
  initialGoals: Goal[];
};

export function ObiettiviClient({ userId, plan, initialGoals }: Props) {
  const [goals, setGoals] = useState(initialGoals);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [deadline, setDeadline] = useState("");
  const [icon, setIcon] = useState("🎯");

  // Add progress state
  const [addingProgress, setAddingProgress] = useState<string | null>(null);
  const [progressAmount, setProgressAmount] = useState("");

  const isFree = plan === "free";
  const atLimit = isFree && goals.length >= FREE_GOAL_LIMIT;

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("goals")
      .insert({
        user_id: userId,
        name: name.trim(),
        target_amount: parseFloat(targetAmount.replace(",", ".")),
        current_amount: parseFloat(currentAmount.replace(",", ".") || "0"),
        deadline: deadline || null,
        icon,
      })
      .select()
      .single();

    if (error) {
      toast.error("Errore nel salvataggio. Riprova.");
    } else {
      setGoals(prev => [data as Goal, ...prev]);
      toast.success("Obiettivo creato!");
      setShowForm(false);
      setName(""); setTargetAmount(""); setCurrentAmount("0"); setDeadline(""); setIcon("🎯");
    }
    setSubmitting(false);
  }

  async function handleAddProgress(goalId: string) {
    const amount = parseFloat(progressAmount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) return;

    const supabase = createClient();
    const goal = goals.find(g => g.id === goalId)!;
    const newAmount = Math.min(Number(goal.target_amount), Number(goal.current_amount) + amount);

    const { error } = await supabase
      .from("goals")
      .update({ current_amount: newAmount })
      .eq("id", goalId);

    if (error) {
      toast.error("Errore nell'aggiornamento.");
    } else {
      setGoals(prev => prev.map(g => g.id === goalId ? { ...g, current_amount: newAmount } : g));
      toast.success("Progresso aggiornato!");
      setAddingProgress(null);
      setProgressAmount("");
    }
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) {
      toast.error("Errore nella cancellazione.");
    } else {
      setGoals(prev => prev.filter(g => g.id !== id));
      toast.success("Obiettivo eliminato.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Obiettivi finanziari</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          disabled={atLimit}
          title={atLimit ? "Limite di 1 obiettivo nel piano gratuito." : ""}
          className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          + Nuovo obiettivo
        </button>
      </div>

      {atLimit && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm flex items-center justify-between gap-4">
          <span>Con il piano gratuito puoi avere 1 solo obiettivo.</span>
          <Link href="/pricing" className="text-primary font-medium hover:underline whitespace-nowrap">
            Passa a Premium
          </Link>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleCreateGoal} className="rounded-xl border p-5 flex flex-col gap-4 bg-card">
          <h2 className="font-semibold">Nuovo obiettivo</h2>

          {/* Icon picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Icona</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(i => (
                <button key={i} type="button" onClick={() => setIcon(i)}
                  className={`text-xl p-2 rounded-lg border transition-colors ${icon === i ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}>
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Nome obiettivo</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                placeholder="es. Vacanza estiva, Fondo emergenza..."
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Importo obiettivo (€)</label>
              <input type="text" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} required
                placeholder="es. 3000"
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Già risparmiato (€)</label>
              <input type="text" value={currentAmount} onChange={e => setCurrentAmount(e.target.value)}
                placeholder="0"
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Scadenza (opzionale)</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {submitting ? "Salvataggio..." : "Crea obiettivo"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border rounded-md px-5 py-2 text-sm hover:bg-muted/50 transition-colors">
              Annulla
            </button>
          </div>
        </form>
      )}

      {/* Goals grid */}
      {goals.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 flex flex-col items-center gap-4 text-center">
          <span className="text-5xl">🎯</span>
          <h2 className="font-semibold text-lg">Nessun obiettivo ancora</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Imposta un obiettivo finanziario — vacanza, fondo emergenza, acquisto importante — e tieni traccia dei progressi.
          </p>
          <button onClick={() => setShowForm(true)}
            className="text-sm bg-primary text-primary-foreground rounded-md px-5 py-2.5 hover:bg-primary/90 transition-colors">
            Crea il primo obiettivo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map(g => {
            const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
            const remaining = Number(g.target_amount) - Number(g.current_amount);
            const completed = pct >= 100;

            return (
              <div key={g.id} className={`rounded-xl border p-5 flex flex-col gap-4 ${completed ? "border-green-500/50 bg-green-500/5" : ""}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{g.icon}</span>
                    <h3 className="font-semibold text-sm">{g.name}</h3>
                  </div>
                  <button onClick={() => handleDelete(g.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors text-xs">
                    ✕
                  </button>
                </div>

                {/* Progress */}
                <div className="flex flex-col gap-2">
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${completed ? "bg-green-500" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatEuro(Number(g.current_amount))}</span>
                    <span className="font-medium">{pct.toFixed(0)}%</span>
                    <span>{formatEuro(Number(g.target_amount))}</span>
                  </div>
                </div>

                {completed ? (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">🎉 Obiettivo raggiunto!</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Mancano {formatEuro(remaining)}
                    {g.deadline && ` · Scadenza: ${new Date(g.deadline).toLocaleDateString("it-IT")}`}
                  </p>
                )}

                {/* Add progress */}
                {!completed && (
                  addingProgress === g.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={progressAmount}
                        onChange={e => setProgressAmount(e.target.value)}
                        placeholder="Importo €"
                        className="border rounded-md px-3 py-1.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
                      />
                      <button onClick={() => handleAddProgress(g.id)}
                        className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs hover:bg-primary/90 transition-colors">
                        +
                      </button>
                      <button onClick={() => { setAddingProgress(null); setProgressAmount(""); }}
                        className="border rounded-md px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingProgress(g.id)}
                      className="text-xs text-primary hover:underline text-left">
                      + Aggiungi risparmio
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
