export interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Loading…" }: LoadingStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16 text-muted"
      role="status"
      aria-live="polite"
    >
      <svg
        className="h-10 w-10 text-accent"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <g strokeWidth="1" opacity="0.5">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
        </g>
        <path
          className="origin-center animate-spin"
          d="M12 3a9 9 0 0 1 8.4 5.2"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <p>{label}</p>
    </div>
  );
}
