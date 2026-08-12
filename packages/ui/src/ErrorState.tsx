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
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-900/60 bg-red-950/40 px-6 py-10 text-center"
      role="alert"
    >
      <p className="text-lg font-bold text-red-300">{title}</p>
      <p className="max-w-md text-sm text-red-200/80">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
