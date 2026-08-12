"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@spiderman/ui";
import type { GameKind, SessionSummary } from "@spiderman/types";
import { useRequirePlayer } from "@/lib/auth";
import { api } from "@/lib/api";
import { LoadingState } from "@spiderman/ui";

const GAME_META: Record<GameKind, { title: string; blurb: string; emoji: string }> = {
  WORDLE: { title: "Wordle", blurb: "Guess the 5-letter word", emoji: "🔤" },
  SHADOW: { title: "Guess the Shadow", blurb: "Identify the character", emoji: "🌑" },
  CARDS: { title: "Match the Cards", blurb: "Flip and match the pairs", emoji: "🃏" },
};

function statusBadge(status: SessionSummary["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "TIMEOUT":
      return "Timed out";
    case "ABANDONED":
      return "Not played";
  }
}

export function Home() {
  const data = useRequirePlayer();
  const router = useRouter();

  if (!data) return <LoadingState label="Checking session…" />;

  const { team, sessions, roundOpen } = data;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Team {team.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Code <span className="font-mono text-red-400">{team.code}</span>
            {team.room ? ` · Room ${team.room}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/leaderboard">
            <Button variant="secondary" size="sm">
              Leaderboard
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await api.playerLogout();
              router.replace("/login");
            }}
          >
            Log out
          </Button>
        </div>
      </header>

      {roundOpen ? (
        <div className="mb-6 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Round is live — good luck!
        </div>
      ) : (
        <div className="mb-6 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          The round is not open yet.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(GAME_META) as GameKind[]).map((game) => {
          const summary = sessions[game];
          const finished = summary.status === "COMPLETED" || summary.status === "TIMEOUT";
          return (
            <Card key={game} title={GAME_META[game].title}>
              <div className="text-3xl">{GAME_META[game].emoji}</div>
              <p className="mt-2 text-sm text-slate-400">{GAME_META[game].blurb}</p>
              <p className="mt-3 text-sm">
                <span className="text-slate-500">{statusBadge(summary.status)}</span>
                {summary.score !== null ? (
                  <span className="ml-2 font-semibold text-red-400">{summary.score}</span>
                ) : null}
              </p>
              <div className="mt-4">
                {finished ? (
                  <Button size="sm" variant="ghost" disabled>
                    {summary.status === "COMPLETED" ? "Played" : "Timed out"}
                  </Button>
                ) : (
                  <Link href={`/play/${game.toLowerCase()}`}>
                    <Button size="sm">{roundOpen ? "Play" : "Waiting"}</Button>
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
