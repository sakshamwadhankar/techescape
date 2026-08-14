import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  /** Emphasise the card as a page lead with a red accent hairline. */
  lead?: boolean;
}

export function Card({ title, lead = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border border-line bg-panel p-5 shadow-xl shadow-black/40 sm:p-6",
        lead ? "border-t-2 border-t-accent" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {title ? (
        <h3 className="mb-3 font-display text-lg tracking-tight text-ink">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
