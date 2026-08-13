import type { LeaderboardEntry } from "@spiderman/types";

const medalClasses: Record<number, string> = {
  1: "bg-yellow-500/20 text-yellow-300",
  2: "bg-slate-400/20 text-slate-300",
  3: "bg-amber-700/20 text-amber-400",
};

export interface LeaderboardProps {
  entries: LeaderboardEntry[];
  highlightTeamCode?: string;
}

export function Leaderboard({ entries, highlightTeamCode }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-muted">
        No scores yet — be the first to finish a game.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {entries.map((entry) => {
        const highlighted =
          highlightTeamCode !== undefined &&
          entry.teamCode === highlightTeamCode;
        const rankBadge = entry.rank <= 3;
        return (
          <li
            key={entry.teamCode}
            className={[
              "flex items-center gap-4 px-4 py-3 transition-colors",
              highlighted ? "bg-accent/15" : "bg-panel/70 hover:bg-raised/60",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold",
                rankBadge
                  ? medalClasses[entry.rank] ?? "bg-raised text-muted"
                  : "bg-raised text-muted",
              ].join(" ")}
            >
              {entry.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">
                {entry.teamName}
                {highlighted ? (
                  <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-white">
                    You
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-faint">
                {entry.gamesCompleted}/3 games · {formatTime(entry.totalTimeMs)}
              </p>
            </div>
            <span className="font-display text-lg tracking-tight text-ink">
              {entry.totalScore}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
