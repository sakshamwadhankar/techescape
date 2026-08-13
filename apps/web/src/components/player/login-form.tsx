"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorState } from "@spiderman/ui";
import { api, ApiError } from "@/lib/api";
import { SpiderLogo } from "@/components/spider-logo";

export function LoginForm() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.playerLogin(accessCode.trim(), pin);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-panel text-accent shadow-xl shadow-black/40">
          <SpiderLogo className="h-9 w-9" />
        </div>
        <h1 className="mt-4 font-display text-4xl tracking-tight text-ink">
          Spider-Man Challenge
        </h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          Tech Escape · Round 1
        </p>
        <p className="mt-3 text-sm text-muted">
          Enter your team code and the event PIN to begin.
        </p>
      </div>
      <Card title="Team login" lead>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="accessCode" className="field-label">
              Access code
            </label>
            <input
              id="accessCode"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="field-input font-mono"
              placeholder="e.g. TEAMA"
              required
            />
          </div>
          <div>
            <label htmlFor="pin" className="field-label">
              Event PIN
            </label>
            <input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="field-input font-mono"
              placeholder="••••"
              required
            />
          </div>
          {error ? <ErrorState title="Login failed" message={error} /> : null}
          <Button type="submit" full disabled={submitting}>
            {submitting ? "Signing in…" : "Start"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
