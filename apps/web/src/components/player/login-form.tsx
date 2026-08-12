"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorState } from "@spiderman/ui";
import { api, ApiError } from "@/lib/api";

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
        <div className="text-4xl">🕷️</div>
        <h1 className="mt-2 text-3xl font-extrabold text-red-500">Spider-Man Challenge</h1>
        <p className="mt-1 text-sm text-slate-400">
          Enter your team code and the event PIN to begin.
        </p>
      </div>
      <Card title="Team login">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="accessCode" className="mb-1 block text-sm text-slate-400">
              Access code
            </label>
            <input
              id="accessCode"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-red-500"
              placeholder="e.g. TEAMA"
              required
            />
          </div>
          <div>
            <label htmlFor="pin" className="mb-1 block text-sm text-slate-400">
              Event PIN
            </label>
            <input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-red-500"
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
