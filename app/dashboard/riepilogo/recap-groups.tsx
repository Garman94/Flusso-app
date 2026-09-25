"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEuro } from "@/lib/calculations";
import type { SpendingGroups } from "@/lib/recap";

type Group = {
  key: string; icon: string; label: string; color: string;
  spent: number; planned: number | null;
  status: React.ReactNode;
  details: React.ReactNode;
};

function Bar({ value, max, color, over }: { value: number; max: number; color: string; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: over ? "#ef4444" : color }} />
    </div>
  );
}

/**
 * Le uscite divise come in Pianifica (spese fisse, rate, budget, altre spese, accantonamenti),
 * con quanto era previsto. Una striscia in cima mostra le proporzioni; ogni gruppo si apre.
 */
export function RecapGroups({ groups, total }: { groups: SpendingGroups; total: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const list: Group[] = [];

  if (groups.fisse) {
    const items = groups.fisse.subgroups.flatMap(s => s.items);
    const paid = items.filter(i => i.paid).length;
    list.push({
      key: "fisse", icon: "📋", label: "Spese fisse", color: "#0ea5e9",
      spent: groups.fisse.spent, planned: groups.fisse.planned,
      status: paid === items.length
        ? <span className="text-green-600 dark:text-green-400">tutte pagate ✓</span>
        : <span className="text-muted-foreground">{paid} su {items.length} trovate nei movimenti</span>,
      details: (
        <div className="flex flex-col gap-3">
          {groups.fisse.subgroups.map(s => (
            <div key={s.key} className="flex flex-col gap-1">
              <div className="flex justify-between gap-3 text-sm font-medium">
                <span>{s.icon} {s.label}</span>
                <span className="tabular-nums shrink-0">
                  {formatEuro(s.spent)} <span className="text-muted-foreground font-normal">di {formatEuro(s.planned)}</span>
                </span>
              </div>
              {s.items.map((it, i) => (
                <div key={i} className="flex justify-between gap-3 text-xs text-muted-foreground pl-6">
                  <span>{it.paid ? "✓" : "·"} {it.name}{!it.paid && " (non trovata)"}</span>
                  <span className="tabular-nums shrink-0">{formatEuro(it.paid ? it.spent : it.planned)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ),
    });
  }

  if (groups.rate) {
    list.push({
      key: "rate", icon: "📆", label: "Rate e mutui", color: "#f43f5e",
      spent: groups.rate.spent, planned: groups.rate.planned,
      status: groups.rate.spent + 0.5 >= groups.rate.planned
        ? <span className="text-green-600 dark:text-green-400">pagate ✓</span>
        : <span className="text-muted-foreground">non tutte trovate nei movimenti</span>,
      details: null,
    });
  }

  if (groups.budget) {
    const diff = groups.budget.planned - groups.budget.spent;
    list.push({
      key: "budget", icon: "🧮", label: "Budget", color: "#8b5cf6",
      spent: groups.budget.spent, planned: groups.budget.planned,
      status: diff >= 0
        ? <span className="text-green-600 dark:text-green-400">{formatEuro(diff)} sotto il previsto ✓</span>
        : <span className="text-red-500">{formatEuro(-diff)} oltre il previsto</span>,
      details: (
        <div className="flex flex-col gap-2.5">
          {groups.budget.categories.map(c => {
            const over = c.spent > c.planned + 0.005;
            return (
              <div key={c.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span>{c.icon} {c.name}</span>
                  <span className={`tabular-nums shrink-0 ${over ? "text-red-500" : ""}`}>
                    {formatEuro(c.spent)} <span className="text-muted-foreground">di {formatEuro(c.planned)}</span>
                  </span>
                </div>
                <Bar value={c.spent} max={c.planned} color="#8b5cf6" over={over} />
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">Previsto = il budget di oggi. Spese fisse e rate non contano qui.</p>
        </div>
      ),
    });
  }

  if (groups.altre) {
    list.push({
      key: "altre", icon: "🛍️", label: "Altre spese", color: "#f59e0b",
      spent: groups.altre.spent, planned: null,
      status: <span className="text-muted-foreground">categorie senza budget</span>,
      details: (
        <div className="flex flex-col gap-1.5">
          {groups.altre.categories.map(c => (
            <div key={c.id} className="flex justify-between gap-3 text-sm">
              <span>{c.icon} {c.name}</span>
              <span className="tabular-nums shrink-0">{formatEuro(c.spent)}</span>
            </div>
          ))}
          <Link href="/dashboard/smart?v=budget" className="text-xs text-primary hover:underline pt-1">
            Dai un budget a queste categorie, per sapere in anticipo quanto spendere →
          </Link>
        </div>
      ),
    });
  }

  if (groups.accantonamenti) {
    list.push({
      key: "accantonamenti", icon: "🏦", label: "Accantonamenti", color: "#10b981",
      spent: groups.accantonamenti.spent, planned: null,
      status: <span className="text-muted-foreground">messi da parte per le spese dell&apos;anno</span>,
      details: null,
    });
  }

  if (list.length === 0) return null;

  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Le uscite</h2>
        <span className="text-sm font-semibold tabular-nums">{formatEuro(total)}</span>
      </div>

      <div className="h-3 rounded-full overflow-hidden flex bg-muted">
        {list.map(g => (
          <div key={g.key} style={{ width: `${total > 0 ? (g.spent / total) * 100 : 0}%`, backgroundColor: g.color }} title={g.label} />
        ))}
      </div>

      <div className="flex flex-col divide-y">
        {list.map(g => {
          const isOpen = open === g.key;
          return (
            <div key={g.key} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2">
              <button
                onClick={() => g.details && setOpen(isOpen ? null : g.key)}
                className={`flex flex-col gap-1.5 text-left ${g.details ? "" : "cursor-default"}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                    {g.icon} {g.label}
                    {g.details && <span className={`text-muted-foreground text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}>⌄</span>}
                  </span>
                  <span className="text-sm tabular-nums shrink-0">
                    <strong>{formatEuro(g.spent)}</strong>
                    {g.planned !== null && <span className="text-muted-foreground"> di {formatEuro(g.planned)}</span>}
                  </span>
                </div>
                {g.planned !== null && (
                  <Bar value={g.spent} max={g.planned} color={g.color} over={g.key === "budget" && g.spent > g.planned + 0.005} />
                )}
                <span className="text-xs">{g.status}</span>
              </button>
              {isOpen && g.details && <div className="pl-4 pt-1">{g.details}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
