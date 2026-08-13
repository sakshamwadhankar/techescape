"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorState } from "@spiderman/ui";
import { api, ApiError } from "@/lib/api";
import { SpiderLogo } from "@/components/spider-logo";

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.adminLogin(username, password);
      router.replace("/admin");
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
        <h1 className="mt-4 font-display text-4xl tracking-tight text-ink">Admin</h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          Control room
        </p>
        <p className="mt-3 text-sm text-muted">Organizer controls.</p>
      </div>
      <Card title="Sign in" lead>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="field-label">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="field-input"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="field-input"
              required
            />
          </div>
          {error ? <ErrorState title="Login failed" message={error} /> : null}
          <Button type="submit" full disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
