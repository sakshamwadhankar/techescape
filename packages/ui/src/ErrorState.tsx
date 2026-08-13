export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-accent-deep bg-accent-deep/30 px-6 py-10 text-center"
      role="alert"
    >
      <p className="font-display text-lg tracking-tight text-accent-bright">{title}</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
