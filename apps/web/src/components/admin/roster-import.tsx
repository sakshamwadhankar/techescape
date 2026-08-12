"use client";

import { useState } from "react";
import { Button, Card, ErrorState } from "@spiderman/ui";
import { api, ApiError } from "@/lib/api";

const PLACEHOLDER = `[
  { "code": "TEAMA", "name": "Team Alpha", "memberNames": ["Alice", "Bob"], "room": "101" }
]`;

export function RosterImport({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const importRoster = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new ApiError(400, "Provide a JSON array of at least one team.");
      }
      const teams = parsed as {
        code: string;
        name: string;
        memberNames: string[];
        room?: string | null;
      }[];
      const res = await api.adminRosterImport(teams);
      setResult(
        `Imported ${res.created} new, updated ${res.updated} (${res.total} total).`,
      );
      setText("");
      onImported();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof SyntaxError
            ? "Invalid JSON — check the syntax."
            : "Could not import the roster.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Import roster">
      <p className="mb-3 text-sm text-slate-400">
        Paste a JSON array of teams. Existing codes are updated.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={5}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-red-500"
        placeholder={PLACEHOLDER}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" disabled={busy || text.trim() === ""} onClick={() => void importRoster()}>
          {busy ? "Importing…" : "Import"}
        </Button>
        {result ? <span className="text-sm text-green-400">{result}</span> : null}
      </div>
      {error ? <div className="mt-3"><ErrorState title="Import failed" message={error} /></div> : null}
    </Card>
  );
}
