"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Dialog, ErrorState, LoadingState } from "@spiderman/ui";
import type { AdminTeamsResponse, GameKind } from "@spiderman/types";
import { api, ApiError } from "@/lib/api";

const GAME_LABELS: Record<GameKind, string> = {
  WORDLE: "Wordle",
  SHADOW: "Shadow",
  CARDS: "Cards",
};

interface ResetTarget {
  teamId: string;
  teamName: string;
  game?: GameKind;
}

export function TeamsPanel() {
  const [data, setData] = useState<AdminTeamsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.adminTeams());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load teams");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmReset = async () => {
    if (!resetTarget) return;
    setBusy(true);
    setResetError(null);
    try {
      await api.adminTeamReset(resetTarget.teamId, resetTarget.game);
      setResetTarget(null);
      await load();
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Could not reset the team");
    } finally {
      setBusy(false);
    }
  };

  const { total } = data ?? { total: 0 };

  return (
    <Card title={`Teams (${total})`}>
      {error && !data ? <ErrorState title="Could not load teams" message={error} /> : null}
      {!data && !error ? <LoadingState label="Loading teams…" /> : null}
      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-2 pr-3 font-medium">Team</th>
                <th className="py-2 pr-3 font-medium">Members</th>
                <th className="py-2 pr-3 font-medium">Score</th>
                <th className="py-2 pr-3 font-medium">Games</th>
                <th className="py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((team) => (
                <tr key={team.id} className="border-b border-slate-800/60">
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-slate-100">{team.name}</p>
                    <p className="text-xs text-slate-500">
                      {team.code}
                      {team.room ? ` · ${team.room}` : ""}
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-slate-400">
                    {team.memberNames.join(", ") || "—"}
                  </td>
                  <td className="py-2 pr-3 font-bold text-red-400">{team.totalScore}</td>
                  <td className="py-2 pr-3">
                    {team.sessions.length === 0 ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {team.sessions.map((session) => (
                          <p key={session.game} className="text-xs text-slate-400">
                            {GAME_LABELS[session.game]}:{" "}
                            <span
                              className={
                                session.status === "COMPLETED"
                                  ? "text-green-400"
                                  : session.status === "ACTIVE"
                                    ? "text-amber-400"
                                    : "text-slate-500"
                              }
                            >
                              {session.status}
                            </span>{" "}
                            {session.score !== null ? `(${session.score})` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResetTarget({ teamId: team.id, teamName: team.name })}
                    >
                      Reset
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={resetTarget !== null}
        title="Reset team"
        message={
          resetTarget
            ? `Reset all game sessions for ${resetTarget.teamName}? Scores will be removed and they can play again.`
            : ""
        }
        confirmLabel={busy ? "Resetting…" : "Reset"}
        onConfirm={() => void confirmReset()}
        onCancel={() => setResetTarget(null)}
      />
      {resetError ? (
        <div className="mt-3"><ErrorState title="Reset failed" message={resetError} /></div>
      ) : null}
    </Card>
  );
}
