"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@spiderman/ui";
import type { GameKind, SessionSummary } from "@spiderman/types";
import { useRequirePlayer } from "@/lib/auth";
import { api } from "@/lib/api";
import { LoadingState } from "@spiderman/ui";
import { GiCardRandom, GiKeyboard, GiSpectre } from "react-icons/gi";

const GAME_META: Record<GameKind, { title: string; blurb: string; icon: React.ReactNode }> = {
  WORDLE: {
    title: "Wordle",
    blurb: "Guess the 5-letter word",
    icon: <GiKeyboard className="h-7 w-7" aria-hidden="true" />,
  },
  SHADOW: {
    title: "Guess the Shadow",
    blurb: "Identify the character",
    icon: <GiSpectre className="h-7 w-7" aria-hidden="true" />,
  },
  CARDS: {
    title: "Match the Cards",
    blurb: "Flip and match the pairs",
    icon: <GiCardRandom className="h-7 w-7" aria-hidden="true" />,
  },
};

function statusMeta(status: SessionSummary["status"]): {
  label: string;
  chip: string;
  score?: boolean;
} {
  switch (status) {
    case "ACTIVE":
      return { label: "In progress", chip: "border-green-800/60 bg-green-900/40 text-green-300" };
    case "COMPLETED":
      return { label: "Completed", chip: "border-accent/50 bg-accent/15 text-accent-bright", score: true };
    case "TIMEOUT":
      return { label: "Timed out", chip: "border-amber-800/60 bg-amber-900/30 text-amber-300", score: true };
    case "ABANDONED":
      return { label: "Not played", chip: "border-line bg-raised/50 text-muted" };
  }
}

export function Home() {
  const data = useRequirePlayer();
  const router = useRouter();

  if (!data) return <LoadingState label="Checking session…" />;

  const { team, sessions, roundOpen } = data;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">
            Ready, web-heads?
          </p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-ink">
            {team.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Code{" "}
            <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-accent-bright">
              {team.code}
            </span>
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
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-bright">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          Round is live — good luck!
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-line bg-panel/70 px-4 py-3 text-sm text-muted">
          The round is not open yet.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(GAME_META) as GameKind[]).map((game) => {
          const summary = sessions[game];
          const meta = statusMeta(summary.status);
          const finished = summary.status === "COMPLETED" || summary.status === "TIMEOUT";
          return (
            <Card
              key={game}
              className="flex flex-col transition-transform hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-raised text-accent">
                  {GAME_META[game].icon}
                </div>
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.chip}`}
                >
                  {meta.label}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg tracking-tight text-ink">
                {GAME_META[game].title}
              </h3>
              <p className="mt-1 text-sm text-muted">{GAME_META[game].blurb}</p>
              {summary.score !== null ? (
                <p className="mt-2 font-mono text-sm text-accent-bright">
                  Score {summary.score}
                </p>
              ) : null}
              <div className="mt-4 flex-1" />
              <div>
                {finished ? (
                  <Button size="sm" variant="ghost" disabled full>
                    {summary.status === "COMPLETED" ? "Played" : "Timed out"}
                  </Button>
                ) : (
                  <Link href={`/play/${game.toLowerCase()}`} className="block">
                    <Button size="sm" full>
                      {roundOpen ? "Play" : "Waiting"}
                    </Button>
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
