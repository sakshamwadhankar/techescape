"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorState } from "@spiderman/ui";
import type { AdminRoundStatusResponse, RoundStatus } from "@spiderman/types";
import { api, ApiError } from "@/lib/api";

interface RoundPanelProps {
  round: AdminRoundStatusResponse;
  onRoundChange: (round: AdminRoundStatusResponse) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RoundPanel({ round, onRoundChange }: RoundPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState({
    wordleEnabled: round.wordleEnabled,
    shadowEnabled: round.shadowEnabled,
    cardsEnabled: round.cardsEnabled,
    wordleAnswer: round.wordleAnswer ?? "",
    cardsSeed: round.cardsSeed ?? "",
  });

  useEffect(() => {
    setConfig({
      wordleEnabled: round.wordleEnabled,
      shadowEnabled: round.shadowEnabled,
      cardsEnabled: round.cardsEnabled,
      wordleAnswer: round.wordleAnswer ?? "",
      cardsSeed: round.cardsSeed ?? "",
    });
  }, [round]);

  const run = async (action: "start" | "pause" | "resume" | "end") => {
    setBusy(true);
    setError(null);
    try {
      onRoundChange(await api.adminRoundAction(action));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${action} the round`);
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.adminRoundConfig({
        wordleEnabled: config.wordleEnabled,
        shadowEnabled: config.shadowEnabled,
        cardsEnabled: config.cardsEnabled,
        wordleAnswer: config.wordleAnswer.trim() || null,
        cardsSeed: config.cardsSeed === "" ? null : Number(config.cardsSeed),
      });
      onRoundChange(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the config");
    } finally {
      setBusy(false);
    }
  };

  const statusStyles: Record<RoundStatus, string> = {
    IDLE: "bg-slate-800 text-slate-300",
    ACTIVE: "bg-green-900/60 text-green-300",
    PAUSED: "bg-amber-900/60 text-amber-300",
    ENDED: "bg-red-900/60 text-red-300",
  };

  return (
    <Card title="Round">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-md px-3 py-1 text-sm font-bold ${statusStyles[round.status]}`}>
          Round {round.number} · {round.status}
        </span>
        <span className="text-sm text-slate-400">
          Started {formatTime(round.startedAt)}
          {round.status === "ACTIVE" && round.expiresAt ? ` · ends ${formatTime(round.expiresAt)}` : ""}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || (round.status !== "IDLE" && round.status !== "ENDED")}
          onClick={() => void run("start")}
        >
          {round.status === "ENDED" ? "Restart round" : "Start"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || round.status !== "ACTIVE"}
          onClick={() => void run("pause")}
        >
          Pause
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || round.status !== "PAUSED"}
          onClick={() => void run("resume")}
        >
          Resume
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={busy || (round.status !== "ACTIVE" && round.status !== "PAUSED")}
          onClick={() => void run("end")}
        >
          End round
        </Button>
      </div>

      <div className="mt-6 space-y-4 border-t border-slate-800 pt-4">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={config.wordleEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, wordleEnabled: e.target.checked }))}
              className="accent-red-600"
            />
            Wordle
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={config.shadowEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, shadowEnabled: e.target.checked }))}
              className="accent-red-600"
            />
            Shadow
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={config.cardsEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, cardsEnabled: e.target.checked }))}
              className="accent-red-600"
            />
            Cards
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wordleAnswer" className="mb-1 block text-sm text-slate-400">
              Wordle answer (5 letters)
            </label>
            <input
              id="wordleAnswer"
              value={config.wordleAnswer}
              onChange={(e) => setConfig((c) => ({ ...c, wordleAnswer: e.target.value }))}
              maxLength={5}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-red-500"
              placeholder="spide"
            />
          </div>
          <div>
            <label htmlFor="cardsSeed" className="mb-1 block text-sm text-slate-400">
              Cards shuffle seed
            </label>
            <input
              id="cardsSeed"
              type="number"
              value={config.cardsSeed}
              onChange={(e) => setConfig((c) => ({ ...c, cardsSeed: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-red-500"
              placeholder="optional"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={busy} onClick={() => void saveConfig()}>
            Save config
          </Button>
          <span className="text-xs text-slate-500">Takes effect next round.</span>
        </div>
      </div>

      {error ? <div className="mt-4"><ErrorState title="Action failed" message={error} /></div> : null}
    </Card>
  );
}
