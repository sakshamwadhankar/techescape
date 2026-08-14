"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorState, Leaderboard, LoadingState } from "@spiderman/ui";
import type {
  LeaderboardMeResponse,
  LeaderboardResponse,
} from "@spiderman/types";
import { api, ApiError } from "@/lib/api";

interface LeaderboardState {
  data: LeaderboardResponse | null;
  me: LeaderboardMeResponse | null;
  error: string | null;
  busy: boolean;
}

export function LeaderboardView() {
  const [state, setState] = useState<LeaderboardState>({
    data: null,
    me: null,
    error: null,
    busy: false,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const [data, me] = await Promise.all([api.leaderboard(50), api.leaderboardMe()]);
      setState((s) => ({ ...s, data, me, busy: false }));
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: err instanceof ApiError ? err.message : "Could not load the leaderboard",
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { data, me, error, busy } = state;

  const highlightTeamCode =
    me?.entry && me.rank !== null ? me.entry.teamCode : undefined;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted">
            {data ? `${data.totalTeams} teams entered` : "Standings by total score"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </Button>
          <Link href="/">
            <Button variant="ghost" size="sm">
              Home
            </Button>
          </Link>
        </div>
      </header>

      {error && !data ? <ErrorState title="Could not load" message={error} /> : null}

      {!data && !error ? <LoadingState label="Loading leaderboard…" /> : null}

      {data ? (
        <>
          <Leaderboard entries={data.entries} highlightTeamCode={highlightTeamCode} />
          {me?.entry && me.rank !== null ? (
            <p className="mt-4 text-center text-sm text-muted">
              You are currently{" "}
              <span className="font-mono font-bold text-accent-bright">
                #{me.rank}
              </span>{" "}
              of {data.totalTeams} teams.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
