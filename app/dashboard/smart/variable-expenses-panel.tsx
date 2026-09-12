"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatEuro,
  minMaxOverMonths,
  seasonalBillRange,
  combineVariableExpenses,
  aggregateSinkingFunds,
  txMatchesKeywords,
  type SinkingFundInput,
} from "@/lib/calculations";

type Category = { id: string; name: string; color: string; icon: string };
type Tx = {
  date: string; amount: number;
  category_id?: string | null; description?: string | null; merchant?: string | null;
};
type RecurringItem = {
  id: string; name: string; tipologia: string; matching_strategy: string;
  match_keywords: string[]; secondary_name: string | null;
  amount: number; amount_max: number | null;
  next_due_date: string | null; saving_start_date: string | null;
};

type Props = {
  userId: string;
  categories: Category[];
  transactions: Tx[];
  recurringItems: RecurringItem[];
  initialSelectedCategoryIds: string[];
  piggyBalance: number;
  onBack: () => void;
};

const DEFAULT_CATEGORY_NAMES = ["Alimentari", "Abbigliamento", "Tecnologia", "Trasporti", "Intrattenimento"];

function monthBounds(year: number, month: number) {
  const from = new Date(year, month, 1).toISOString().split("T")[0];
  const to = new Date(year, month + 1, 0).toISOString().split("T")[0];
  return { from, to };
}

function effectiveKeywords(item: RecurringItem): string[] {
  const kws = [...item.match_keywords];
  if (item.secondary_name && !kws.some(k => k.toLowerCase() === item.secondary_name!.toLowerCase())) {
    kws.push(item.secondary_name);
  }
  return kws;
}

function MonitorRow({
  icon, name, min, max, current, emptyLabel,
}: { icon: string; name: string; min: number; max: number; current: number; emptyLabel: string }) {
  const hasRange = max > 0 || min > 0;
  const status = current > max ? "over" : current < min ? "under" : "in";
  const statusStyle = {
    over:  { text: "text-red-500",                          bg: "bg-red-500/10",   label: "Sopra il range" },
    under: { text: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/10",  label: "Sotto il range" },
    in:    { text: "text-green-600 dark:text-green-400",     bg: "bg-green-500/10", label: "Nel range" },
  }[status];

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium truncate">{icon} {name}</span>
        <span className="text-xs text-muted-foreground">
          {hasRange ? `Range: ${formatEuro(min)} – ${formatEuro(max)}` : emptyLabel}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-sm font-semibold tabular-nums">{formatEuro(current)}</span>
        {hasRange && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
        )}
      </div>
    </div>
  );
}

export function VariableExpensesPanel({
  userId, categories, transactions, recurringItems, initialSelectedCategoryIds, piggyBalance, onBack,
}: Props) {
  const defaultIds = useMemo(
    () => categories.filter(c => DEFAULT_CATEGORY_NAMES.includes(c.name)).map(c => c.id),
    [categories]
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedCategoryIds.length > 0 ? initialSelectedCategoryIds : defaultIds)
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggleCategory(catId: string) {
    const wasSelected = selected.has(catId);
    setSelected(prev => {
      const next = new Set(prev);
      if (wasSelected) next.delete(catId); else next.add(catId);
      return next;
    });
    setSavingId(catId);
    const supabase = createClient();
    if (wasSelected) {
      await supabase.from("variable_expense_categories").delete().eq("user_id", userId).eq("category_id", catId);
    } else {
      await supabase.from("variable_expense_categories").insert({ user_id: userId, category_id: catId });
    }
    setSavingId(null);
  }

  const now = new Date();
  const calYear = now.getFullYear(), calMonth = now.getMonth();

  // ── Range per categoria selezionata (ultimi 6 mesi) + spesa del mese in corso ──
  const categoryData = useMemo(() => {
    const { from: curFrom, to: curTo } = monthBounds(calYear, calMonth);
    return categories
      .filter(c => selected.has(c.id))
      .map(c => {
        const monthlyTotals: number[] = [];
        for (let i = 1; i <= 6; i++) {
          const d = new Date(calYear, calMonth - i, 1);
          const { from, to } = monthBounds(d.getFullYear(), d.getMonth());
          const total = transactions
            .filter(t => t.category_id === c.id && t.date >= from && t.date <= to && Number(t.amount) < 0)
            .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
          monthlyTotals.push(total);
        }
        const currentSpend = transactions
          .filter(t => t.category_id === c.id && t.date >= curFrom && t.date <= curTo && Number(t.amount) < 0)
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        return { category: c, range: minMaxOverMonths(monthlyTotals), currentSpend };
      });
  }, [categories, selected, transactions, calYear, calMonth]);

  // ── Bollette stagionali: voci Ricorrenti con "Media storica" ──
  // Fetch mirato per parola chiave (non la finestra "transactions", che e' bounded a 1
  // anno): serve lo storico su piu' anni per lo stesso mese, e una query per keyword
  // resta piccola indipendentemente da quante transazioni totali ha l'utente.
  // Esclude le voci che sono anche accantonamenti (next_due_date+saving_start_date):
  // altrimenti verrebbero contate sia qui sia nella quota mensile di aggregateSinkingFunds.
  const seasonalItems = useMemo(
    () => recurringItems.filter(it => it.matching_strategy === "historical_avg" && !(it.next_due_date && it.saving_start_date)),
    [recurringItems]
  );
  const [seasonalHistory, setSeasonalHistory] = useState<Record<string, Tx[]>>({});

  useEffect(() => {
    if (seasonalItems.length === 0) { setSeasonalHistory({}); return; }
    const supabase = createClient();
    let cancelled = false;
    Promise.all(seasonalItems.map(async item => {
      const kws = effectiveKeywords(item).map(k => k.trim()).filter(Boolean);
      if (kws.length === 0) return [item.id, []] as const;
      const orFilter = kws.flatMap(k => [`description.ilike.%${k}%`, `merchant.ilike.%${k}%`]).join(",");
      const { data } = await supabase.from("transactions")
        .select("date, amount")
        .eq("user_id", userId)
        .lt("amount", 0)
        .or(orFilter);
      return [item.id, (data ?? []) as Tx[]] as const;
    })).then(entries => {
      if (!cancelled) setSeasonalHistory(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [seasonalItems, userId]);

  const seasonalData = useMemo(() => {
    const { from: curFrom, to: curTo } = monthBounds(calYear, calMonth);
    return seasonalItems.map(item => {
      const kws = effectiveKeywords(item);
      const history = seasonalHistory[item.id] ?? [];
      const byYear = new Map<number, number>();
      for (const t of history) {
        const d = new Date(t.date + "T00:00:00");
        if (d.getFullYear() === calYear && d.getMonth() === calMonth) continue; // esclude il mese in corso
        if (d.getMonth() !== calMonth) continue;
        byYear.set(d.getFullYear(), (byYear.get(d.getFullYear()) ?? 0) + Math.abs(Number(t.amount)));
      }
      const currentSpend = transactions
        .filter(t => Number(t.amount) < 0 && t.date >= curFrom && t.date <= curTo && txMatchesKeywords(t, kws))
        .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      return { item, range: seasonalBillRange(Array.from(byYear.values())), currentSpend };
    });
  }, [seasonalItems, seasonalHistory, transactions, calYear, calMonth]);

  // ── Accantonamento mensile ──
  const sinkingSummary = useMemo(() => {
    const inputs: SinkingFundInput[] = recurringItems
      .filter(it => it.next_due_date && it.saving_start_date)
      .map(it => ({
        id: it.id,
        name: it.name,
        amount_per_cycle: it.tipologia === "variabile" && it.amount_max != null
          ? (it.amount + it.amount_max) / 2
          : it.amount,
        saving_start_date: it.saving_start_date!,
        next_due_date: it.next_due_date!,
      }));
    return aggregateSinkingFunds(inputs, piggyBalance);
  }, [recurringItems, piggyBalance]);

  const totalRange = combineVariableExpenses({
    sinkingFundMonthly: sinkingSummary.this_month_total,
    categoryRanges: categoryData.map(d => d.range),
    seasonalRanges: seasonalData.map(d => d.range),
  });

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors self-start">
        ← Indietro
      </button>

      <div>
        <h1 className="text-xl font-bold">Spese variabili</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scegli quali categorie contano come spese variabili e monitora quanto hai speso questo mese
          rispetto al range osservato.
        </p>
      </div>

      <div className="rounded-2xl border-2 p-5 flex flex-col gap-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Range mensile stimato</span>
        <span className="text-2xl font-bold tabular-nums">{formatEuro(totalRange.min)} – {formatEuro(totalRange.max)}</span>
        {sinkingSummary.this_month_total > 0 && (
          <span className="text-xs text-muted-foreground">
            Include {formatEuro(sinkingSummary.this_month_total)}/mese di accantonamenti
          </span>
        )}
      </div>

      <div className="rounded-xl border p-5 flex flex-col gap-3">
        <h2 className="font-semibold text-sm">Categorie variabili</h2>
        <div className="flex flex-col gap-2">
          {categories.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                disabled={savingId === c.id}
                onChange={() => toggleCategory(c.id)}
                className="accent-primary"
              />
              <span>{c.icon} {c.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-5 flex flex-col gap-4">
        <h2 className="font-semibold text-sm">Monitoraggio del mese</h2>
        {categoryData.length === 0 && seasonalData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Seleziona almeno una categoria qui sopra.</p>
        ) : (
          <>
            {categoryData.map(({ category, range, currentSpend }) => (
              <MonitorRow
                key={category.id}
                icon={category.icon}
                name={category.name}
                min={range.min}
                max={range.max}
                current={currentSpend}
                emptyLabel="Nessuno storico negli ultimi 6 mesi"
              />
            ))}
            {seasonalData.map(({ item, range, currentSpend }) => (
              <MonitorRow
                key={item.id}
                icon="⚡"
                name={item.name}
                min={range.min}
                max={range.max}
                current={currentSpend}
                emptyLabel="Nessuno storico ancora per questo mese negli anni scorsi"
              />
            ))}
          </>
        )}
        {seasonalItems.length === 0 && (
          <p className="text-xs text-muted-foreground pt-1 border-t">
            💡 Le bollette stagionali (luce/gas) compaiono qui automaticamente se in Smart → Ricorrenti crei
            una voce con strategia &quot;📊 Media storica&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
