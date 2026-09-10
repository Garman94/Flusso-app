"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { IncomeWizard } from "@/components/income-wizard";
import { useDemoGuard } from "@/components/demo-context";
import { formatEuro, hasIncomeInfo, type IncomeInfo } from "@/lib/calculations";

type FamilyMember = {
  id: string;
  name: string;
  color: string;
} & Partial<IncomeInfo>;

const PRESET_COLORS = [
  "#6366f1", "#ec4899", "#f97316", "#22c55e",
  "#3b82f6", "#a855f7", "#eab308", "#14b8a6",
];

const INCOME_COLS = "id, name, color, income_type, monthly_income, income_frequency, income_payday, income_variability, active_months";

const emptyIncome: IncomeInfo = {
  income_type: null, monthly_income: null, income_frequency: null,
  income_payday: null, income_variability: null, active_months: [],
};

export function FamilyMembersSection({ userId }: { userId: string }) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [income, setIncome] = useState<IncomeInfo>(emptyIncome);
  const [showIncomeWizard, setShowIncomeWizard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const demoGuard = useDemoGuard();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("family_members")
      .select(INCOME_COLS)
      .eq("user_id", userId)
      .order("created_at")
      .then(({ data }) => {
        setMembers((data ?? []) as FamilyMember[]);
        setLoading(false);
      });
  }, [userId]);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setColor(PRESET_COLORS[0]);
    setIncome(emptyIncome);
    setShowIncomeWizard(false);
  }

  function startEdit(m: FamilyMember) {
    setEditingId(m.id);
    setName(m.name);
    setColor(m.color);
    setIncome({
      income_type: m.income_type ?? null,
      monthly_income: m.monthly_income ?? null,
      income_frequency: m.income_frequency ?? null,
      income_payday: m.income_payday ?? null,
      income_variability: m.income_variability ?? null,
      active_months: m.active_months ?? [],
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (demoGuard()) return;
    setSaving(true);
    const supabase = createClient();
    const payload = { name: name.trim(), color, ...income };

    if (editingId) {
      const { data, error } = await supabase
        .from("family_members")
        .update(payload)
        .eq("id", editingId)
        .select(INCOME_COLS)
        .single();
      if (error) toast.error("Errore nel salvataggio.");
      else {
        setMembers(prev => prev.map(m => (m.id === editingId ? (data as FamilyMember) : m)));
        toast.success("Componente aggiornato!");
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from("family_members")
        .insert({ user_id: userId, ...payload })
        .select(INCOME_COLS)
        .single();
      if (error) toast.error("Errore nel salvataggio.");
      else {
        setMembers(prev => [...prev, data as FamilyMember]);
        toast.success(`"${data.name}" aggiunto!`);
        resetForm();
      }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (demoGuard()) return;
    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("family_members").delete().eq("id", id);
    if (error) toast.error("Errore nella cancellazione.");
    else {
      setMembers(prev => prev.filter(m => m.id !== id));
      toast.success("Componente rimosso.");
    }
    setDeletingId(null);
  }

  function incomeChip(m: FamilyMember): string | null {
    if (!hasIncomeInfo(m)) return null;
    const icon = m.income_type === "employee" ? "💼" : m.income_type === "freelance" ? "🔧" : "🌿";
    return `${icon} ${formatEuro(Number(m.monthly_income))}/mese`;
  }

  return (
    <div className="rounded-xl border p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Componenti</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggiungi i membri della famiglia o del gruppo, con nome, colore e — se vuoi — le info sul reddito.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setEditingId(null); setShowForm(true); }}
            className="text-sm bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors shrink-0"
          >
            + Aggiungi
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="flex flex-col gap-4 rounded-lg border p-4 bg-muted/20">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Nome</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="es. Marco, Anna, Papà…"
              required
              autoFocus
              className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Colore</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-7 h-7 rounded-full border cursor-pointer bg-background p-0.5"
                title="Colore personalizzato"
              />
            </div>
          </div>

          {/* Reddito */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Reddito (opzionale)</label>
            {showIncomeWizard ? (
              <IncomeWizard
                name={name}
                initial={income}
                onSave={v => { setIncome(v); setShowIncomeWizard(false); }}
                onCancel={() => setShowIncomeWizard(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowIncomeWizard(true)}
                className="self-start text-sm border rounded-md px-3 py-1.5 hover:bg-muted/50"
              >
                {hasIncomeInfo(income) || income.income_type === "none"
                  ? "✏️ Modifica info reddito"
                  : "+ Aggiungi info reddito"}
              </button>
            )}
            {hasIncomeInfo(income) && !showIncomeWizard && (
              <p className="text-xs text-muted-foreground">
                {formatEuro(Number(income.monthly_income))}/mese · {income.income_type}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Salvataggio…" : "Salva"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="border rounded-md px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              Annulla
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="h-10 rounded-lg bg-muted/40" />
          <div className="h-10 rounded-lg bg-muted/40" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="text-3xl">👨‍👩‍👧‍👦</span>
          <p className="text-sm text-muted-foreground">Nessun componente aggiunto.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-2.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                <span className="text-sm font-medium">{m.name}</span>
                {incomeChip(m) && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {incomeChip(m)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(m)}
                  className="text-muted-foreground hover:text-foreground transition-colors text-xs p-1"
                  title="Modifica"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  disabled={deletingId === m.id}
                  className="text-muted-foreground hover:text-destructive transition-colors text-xs p-1 disabled:opacity-40"
                  title="Rimuovi"
                >
                  {deletingId === m.id ? "…" : "✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
