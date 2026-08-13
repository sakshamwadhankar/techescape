"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorState, GameShell } from "@spiderman/ui";
import type {
  GameFinishResponse,
  WordleFeedback,
  WordleStartResponse,
  WordleStatus,
} from "@spiderman/types";
import { actionId, api, ApiError } from "@/lib/api";
import {
  buildWordleGrid,
  deriveKeyStatuses,
  KEYBOARD_ROWS,
  type WordleTile,
} from "@/lib/game-helpers";

interface WordleState {
  start: WordleStartResponse | null;
  guesses: string[];
  feedbackRows: WordleFeedback[][];
  currentRow: string;
  status: WordleStatus;
  result: GameFinishResponse | null;
  error: string | null;
  busy: boolean;
}

const TERMINAL: ReadonlySet<WordleStatus> = new Set(["WON", "LOST", "TIMEOUT"]);

const TILE_COLORS: Record<WordleTile["status"], string> = {
  correct: "bg-green-800 border-green-600",
  present: "bg-yellow-800 border-yellow-600",
  absent: "bg-panel border-line",
  empty: "border-line",
};

const KEY_COLORS: Record<string, string> = {
  correct: "bg-green-700 text-white",
  present: "bg-yellow-700 text-white",
  absent: "bg-line text-faint",
};

export function WordleGame() {
  const [state, setState] = useState<WordleState>({
    start: null,
    guesses: [],
    feedbackRows: [],
    currentRow: "",
    status: "IN_PROGRESS",
    result: null,
    error: null,
    busy: false,
  });

  const finalize = useCallback(async () => {
    if (state.result) return;
    try {
      const result = await api.wordleFinish(actionId("wfin"));
      setState((s) => ({ ...s, result, status: s.status === "IN_PROGRESS" ? "TIMEOUT" : s.status }));
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof ApiError ? err.message : "Could not finalize the game",
      }));
    }
  }, [state.result]);

  useEffect(() => {
    let alive = true;
    api
      .wordleStart()
      .then((start) => alive && setState((s) => ({ ...s, start })))
      .catch((err) =>
        alive &&
        setState((s) => ({
          ...s,
          error: err instanceof ApiError ? err.message : "Could not start the game",
        })),
      );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") submit();
      else if (e.key === "Backspace") backspace();
      else if (/^[a-zA-Z]$/.test(e.key)) pressLetter(e.key.toUpperCase());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const submit = useCallback(async () => {
    const { start, currentRow, status, busy, result } = state;
    if (!start || busy || result || TERMINAL.has(status)) return;
    const guess = currentRow.toLowerCase();
    if (guess.length !== start.wordLength) return;

    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const res = await api.wordleGuess(guess, actionId("wguess"));
      setState((s) => ({
        ...s,
        guesses: [...s.guesses, guess],
        feedbackRows: [...s.feedbackRows, res.feedback],
        currentRow: "",
        status: res.wordleStatus,
        busy: false,
      }));
      if (TERMINAL.has(res.wordleStatus)) {
        const finish = await api.wordleFinish(actionId("wfin"));
        setState((s) => ({ ...s, result: finish }));
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: err instanceof ApiError ? err.message : "Guess failed",
      }));
    }
  }, [state]);

  const pressLetter = useCallback(
    (letter: string) => {
      setState((s) => {
        const { start, currentRow, result, status } = s;
        if (!start || result || TERMINAL.has(status)) return s;
        if (currentRow.length >= start.wordLength) return s;
        return { ...s, currentRow: currentRow + letter };
      });
    },
    [],
  );

  const backspace = useCallback(() => {
    setState((s) =>
      s.currentRow.length > 0 ? { ...s, currentRow: s.currentRow.slice(0, -1) } : s,
    );
  }, []);

  const { start, status, result, error } = state;
  if (error && !start) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
        <ErrorState title="Could not start Wordle" message={error} />
        <Link href="/" className="mt-4 text-center text-sm text-accent-bright hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!start) {
    return <GameShell title="Wordle">Loading…</GameShell>;
  }

  const grid = buildWordleGrid({
    guesses: state.guesses,
    feedbackRows: state.feedbackRows,
    currentRow: state.currentRow,
    attempts: start.attemptsAllowed,
    wordLength: start.wordLength,
  });
  const keyStatuses = deriveKeyStatuses(state.feedbackRows);
  const finished = TERMINAL.has(status);

  return (
    <GameShell
      title="Wordle"
      subtitle={`Guess the ${start.wordLength}-letter word`}
      expiresAt={start.expiresAt}
      onExpire={() => void finalize()}
      footer={
        finished ? (
          <div className="rounded-xl border border-line bg-panel/80 p-6 text-center">
            <p className="font-display text-lg tracking-tight text-ink">
              {status === "WON" ? "You got it!" : status === "LOST" ? "Out of guesses" : "Time's up"}
            </p>
            {result ? (
              <p className="mt-1 text-muted">
                Score{" "}
                <span className="font-mono font-bold text-accent-bright">{result.score}</span>{" "}
                in {Math.round(result.timeMs / 1000)}s
              </p>
            ) : null}
            <Link href="/" className="mt-4 inline-block">
              <Button>Back to home</Button>
            </Link>
          </div>
        ) : (
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={backspace}>
              ⌫ Back
            </Button>
            <Button onClick={() => void submit()} disabled={state.currentRow.length !== start.wordLength || state.busy}>
              Submit
            </Button>
          </div>
        )
      }
    >
      {error && !finished ? <div className="mb-3"><ErrorState title="Something went wrong" message={error} /></div> : null}
      <div className="mx-auto grid w-fit grid-rows-6 gap-1.5">
        {grid.map((row, r) => (
          <div key={r} className="flex gap-1.5">
            {row.map((tile, c) => (
              <div
                key={c}
                className={`flex h-12 w-12 items-center justify-center rounded-lg border text-2xl font-extrabold uppercase transition-colors ${
                  tile.status ? TILE_COLORS[tile.status] : TILE_COLORS.empty
                } ${tile.letter ? "border-accent/60" : ""}`}
              >
                {tile.letter}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mx-auto mt-6 w-fit max-w-full">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} className="mb-1.5 flex justify-center gap-1">
            {row.map((key) => {
              const isAction = key === "ENTER" || key === "BACKSPACE";
              const status = keyStatuses[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={finished}
                  onClick={() => {
                    if (key === "ENTER") void submit();
                    else if (key === "BACKSPACE") backspace();
                    else pressLetter(key);
                  }}
                  className={`rounded-lg px-2 py-3 text-sm font-bold transition-colors ${
                    isAction
                      ? "bg-raised text-ink"
                      : status
                        ? KEY_COLORS[status]
                        : "bg-panel text-ink hover:bg-raised"
                  } disabled:opacity-40`}
                >
                  {key === "BACKSPACE" ? "⌫" : key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </GameShell>
  );
}
