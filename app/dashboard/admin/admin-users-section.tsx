"use client";

import { useState } from "react";
import { AdminUserRow } from "./admin-user-row";

type Profile = { id: string; full_name: string | null; plan: string; created_at: string };

export function AdminUsersSection({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-left group w-fit"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2.5}
          className={`shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {open ? "Nascondi utenti" : `Mostra ${profiles.length} utenti`}
        </span>
      </button>

      {open && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Utente</th>
                <th className="text-left px-4 py-2.5 font-medium">Piano</th>
                <th className="text-left px-4 py-2.5 font-medium">Modifica</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <AdminUserRow key={profile.id} profile={profile} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
