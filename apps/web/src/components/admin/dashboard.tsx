"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LoadingState } from "@spiderman/ui";
import type { AdminRoundStatusResponse } from "@spiderman/types";
import { useRequireAdmin } from "@/lib/auth";
import { api } from "@/lib/api";
import { RoundPanel } from "./round-panel";
import { RosterImport } from "./roster-import";
import { TeamsPanel } from "./teams-panel";

export function Dashboard() {
  const round = useRequireAdmin();
  const router = useRouter();
  const [roundState, setRoundState] = useState<AdminRoundStatusResponse | null>(null);

  if (!round) return <LoadingState label="Checking admin session…" />;

  const current = roundState ?? round;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Admin dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">Spider-Man Challenge control room.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await api.adminLogout();
            router.replace("/admin/login");
          }}
        >
          Log out
        </Button>
      </header>

      <div className="space-y-6">
        <RoundPanel round={current} onRoundChange={setRoundState} />
        <RosterImport onImported={() => {}} />
        <TeamsPanel />
      </div>
    </div>
  );
}
