import { useEffect, useState } from "react";

function getRemainingMs(expiresAt: string, now = Date.now()): number {
  return Math.max(0, new Date(expiresAt).getTime() - now);
}

function format(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export interface TimerProps {
  /** Server-provided ISO expiry timestamp. The countdown is visual only. */
  expiresAt: string;
  onExpire?: () => void;
  className?: string;
}

export function Timer({ expiresAt, onExpire, className = "" }: TimerProps) {
  const [remaining, setRemaining] = useState(() => getRemainingMs(expiresAt));

  useEffect(() => {
    setRemaining(getRemainingMs(expiresAt));
    const id = window.setInterval(() => {
      const next = getRemainingMs(expiresAt);
      setRemaining(next);
      if (next <= 0 && onExpire) onExpire();
    }, 250);
    return () => window.clearInterval(id);
  }, [expiresAt, onExpire]);

  const expired = remaining <= 0;

  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2",
        expired ? "text-red-400" : "text-slate-100",
        className,
      ].join(" ")}
      role="timer"
      aria-live="off"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M9 2h6" />
      </svg>
      <span className="font-mono text-lg font-bold tabular-nums">
        {expired ? "00:00" : format(remaining)}
      </span>
    </div>
  );
}
