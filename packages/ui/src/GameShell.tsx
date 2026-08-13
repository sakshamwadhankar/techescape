import type { ReactNode } from "react";
import { Timer } from "./Timer";

export interface GameShellProps {
  title: string;
  subtitle?: string;
  expiresAt?: string | null;
  onExpire?: () => void;
  /** Wider layout for game boards that need more columns (e.g. 100 cards). */
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function GameShell({
  title,
  subtitle,
  expiresAt,
  onExpire,
  wide = false,
  children,
  footer,
}: GameShellProps) {
  return (
    <div
      className={`mx-auto flex min-h-dvh w-full flex-col px-4 py-6 ${
        wide ? "max-w-5xl" : "max-w-3xl"
      }`}
    >
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {expiresAt ? <Timer expiresAt={expiresAt} onExpire={onExpire} /> : null}
      </header>
      <main className="flex-1">{children}</main>
      {footer ? <footer className="mt-8">{footer}</footer> : null}
    </div>
  );
}
