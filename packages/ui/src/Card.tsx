import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export function Card({ title, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-lg shadow-black/30",
        className,
      ].join(" ")}
      {...props}
    >
      {title ? (
        <h3 className="mb-3 text-lg font-bold text-slate-100">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
