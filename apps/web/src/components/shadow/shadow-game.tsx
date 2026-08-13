"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorState, GameShell } from "@spiderman/ui";
import type {
  GameFinishResponse,
  ShadowAnswerResponse,
  ShadowQuestionPublic,
  ShadowStartResponse,
} from "@spiderman/types";
import { actionId, api, ApiError } from "@/lib/api";

interface ShadowState {
  start: ShadowStartResponse | null;
  index: number;
  attemptsUsed: number;
  wrongAnswers: string[];
  last: { correct: boolean; correctAnswer: string } | null;
  totalCorrect: number;
  status: "IN_PROGRESS" | "COMPLETED" | "TIMEOUT";
  result: GameFinishResponse | null;
  error: string | null;
  busy: boolean;
}

export function ShadowGame() {
  const [state, setState] = useState<ShadowState>({
    start: null,
    index: 0,
    attemptsUsed: 0,
    wrongAnswers: [],
    last: null,
    totalCorrect: 0,
    status: "IN_PROGRESS",
    result: null,
    error: null,
    busy: false,
  });

  useEffect(() => {
    let alive = true;
    api
      .shadowStart()
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

  const answer = useCallback(
    async (option: string) => {
      const { start, busy, status, result } = state;
      if (!start || busy || result || status !== "IN_PROGRESS") return;

      const question = start.questions[state.index];
      if (!question) return;

      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const res: ShadowAnswerResponse = await api.shadowAnswer(
          question.id,
          option,
          actionId("sans"),
        );
        setState((s) => ({
          ...s,
          busy: false,
          attemptsUsed: res.attemptsUsed,
          wrongAnswers:
            res.correct || s.status !== "IN_PROGRESS"
              ? []
              : [...s.wrongAnswers, option],
          last: { correct: res.correct, correctAnswer: res.correctAnswer },
          totalCorrect: res.totalCorrect,
          status: res.status,
        }));
        if (res.status === "COMPLETED") {
          const finish = await api.shadowFinish(actionId("sfin"));
          setState((s) => ({ ...s, result: finish }));
        }
      } catch (err) {
        setState((s) => ({
          ...s,
          busy: false,
          error: err instanceof ApiError ? err.message : "Answer failed",
        }));
      }
    },
    [state],
  );

  const nextQuestion = useCallback(() => {
    setState((s) => ({
      ...s,
      index: s.index + 1,
      attemptsUsed: 0,
      wrongAnswers: [],
      last: null,
      error: null,
    }));
  }, []);

  const { start, status, result, error, last, busy } = state;

  if (error && !start) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
        <ErrorState title="Could not start Shadow" message={error} />
        <Link href="/" className="mt-4 text-center text-sm text-accent-bright hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!start) {
    return <GameShell title="Guess the Shadow">Loading…</GameShell>;
  }

  const question: ShadowQuestionPublic | undefined = start.questions[state.index];
  const finished = status === "COMPLETED" || status === "TIMEOUT";

  return (
    <GameShell
      title="Guess the Shadow"
      subtitle={`Question ${state.index + 1} of ${start.questions.length}`}
      expiresAt={start.expiresAt}
      onExpire={async () => {
        if (status === "IN_PROGRESS") {
          const res = await api.shadowFinish(actionId("sfin"));
          setState((s) => ({ ...s, status: "TIMEOUT", result: res }));
        }
      }}
      footer={
        finished ? (
          <div className="rounded-xl border border-line bg-panel/80 p-6 text-center">
            <p className="font-display text-lg tracking-tight text-ink">
              {status === "COMPLETED"
                ? `You identified ${state.totalCorrect}/${start.questions.length}!`
                : "Time's up"}
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
        ) : question && last && (last.correct || state.attemptsUsed >= start.maxAttemptsPerQuestion) ? (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => void nextQuestion()}>
              Next question →
            </Button>
          </div>
        ) : null
      }
    >
      {error && !finished ? <div className="mb-3"><ErrorState title="Something went wrong" message={error} /></div> : null}

      {finished || !question ? null : (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <img
              src={question.assetUrl}
              alt={`Shadow ${state.index + 1}`}
              className="mx-auto max-h-72 w-full object-contain"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {question.options.map((option) => {
              const isWrong = state.wrongAnswers.includes(option);
              const resolved =
                last?.correct === true || state.attemptsUsed >= start.maxAttemptsPerQuestion;
              const isCorrectAnswer = resolved && last ? option === last.correctAnswer : false;
              const locked = busy || resolved;
              let cls = "border-line bg-panel text-ink hover:bg-raised";
              if (isWrong) cls = "border-accent-deep bg-accent-deep/30 text-accent-bright line-through";
              else if (isCorrectAnswer) cls = "border-green-700 bg-green-900/40 text-green-300";
              return (
                <button
                  key={option}
                  type="button"
                  disabled={locked}
                  onClick={() => void answer(option)}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${cls}`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className="text-sm">
            {last ? (
              last.correct ? (
                <p className="font-semibold text-green-400">
                  Correct! {state.totalCorrect} down.
                </p>
              ) : (
                <p className="text-amber-400">
                  Nope — it was <span className="font-semibold">{last.correctAnswer}</span>.
                  {start.maxAttemptsPerQuestion - state.attemptsUsed > 0
                    ? ` ${start.maxAttemptsPerQuestion - state.attemptsUsed} attempt${
                        start.maxAttemptsPerQuestion - state.attemptsUsed === 1 ? "" : "s"
                      } left.`
                    : ""}
                </p>
              )
            ) : null}
          </div>
        </div>
      )}
    </GameShell>
  );
}
