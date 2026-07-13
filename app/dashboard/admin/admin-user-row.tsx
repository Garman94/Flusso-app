"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPlanLabel, getPlanBadgeColor } from "@/lib/plans";
import { AdminPlanSelect } from "./admin-plan-select";

type Profile = { id: string; full_name: string | null; plan: string; created_at: string };

export function AdminUserRow({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-b hover:bg-muted/20 transition-colors">
        <td className="px-4 py-2">
          <button
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-2 text-left w-full group"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2.5}
              className={`shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span className="text-sm font-medium">{profile.full_name || <span className="text-muted-foreground font-normal">—</span>}</span>
          </button>
        </td>
        <td className="px-4 py-2">
          <Badge className={cn("text-xs", getPlanBadgeColor(profile.plan))}>
            {getPlanLabel(profile.plan)}
          </Badge>
        </td>
        <td className="px-4 py-2">
          <AdminPlanSelect userId={profile.id} currentPlan={profile.plan} />
        </td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/10">
          <td colSpan={3} className="px-8 py-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>ID: <span className="font-mono">{profile.id}</span></span>
              <span>Registrato: {new Date(profile.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
