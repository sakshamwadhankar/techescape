"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorState, GameShell } from "@spiderman/ui";
import type {
  CardPublic,
  CardsMoveResponse,
  CardsStatePublic,
  CardsStartResponse,
  GameFinishResponse,
} from "@spiderman/types";
import { actionId, api, ApiError } from "@/lib/api";
import { buildCardTiles, cardIndexById } from "@/lib/game-helpers";

interface CardsState {
  start: CardsStartResponse | null;
  board: CardsStatePublic | null;
  fronts: Record<string, string>;
  last: CardsMoveResponse | null;
  result: GameFinishResponse | null;
  error: string | null;
  busy: boolean;
}

export function CardsGame() {
  const [state, setState] = useState<CardsState>({
    start: null,
    board: null,
    fronts: {},
    last: null,
    result: null,
    error: null,
    busy: false,
  });

  useEffect(() => {
    let alive = true;
    api
      .cardsStart()
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

  const flip = useCallback(
    async (card: CardPublic) => {
      const { board, start, busy, result } = state;
      if (!start || busy || result) return;

      const tile = buildCardTiles(start.cards, board).find(
        (t) => t.card.id === card.id,
      );
      if (!tile || tile.faceUp || tile.matched) return;

      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const res: CardsMoveResponse = await api.cardsMove(card.id, actionId("cflip"));

        if (res.unmatchedFlipBack && board) {
          const newCardIndex = cardIndexById(start.cards, card.id);
          const preview: CardsStatePublic = {
            ...res.state,
            revealed: Array.from(new Set([...board.revealed, newCardIndex])),
          };
          setState((s) => ({
            ...s,
            board: preview,
            fronts: { ...s.fronts, [card.id]: res.frontAssetUrl },
            last: res,
          }));
          setTimeout(() => {
            setState((s) => ({ ...s, board: res.state, busy: false }));
          }, 2000);
        } else {
          setState((s) => ({
            ...s,
            board: res.state,
            fronts: { ...s.fronts, [card.id]: res.frontAssetUrl },
            last: res,
            busy: false,
          }));
          if (res.state.status === "COMPLETED") {
            const finish = await api.cardsFinish(actionId("cfin"));
            setState((s) => ({ ...s, result: finish }));
          }
        }
      } catch (err) {
        setState((s) => ({
          ...s,
          busy: false,
          error: err instanceof ApiError ? err.message : "Flip failed",
        }));
      }
    },
    [state],
  );

  const { start, board, result, error, fronts, last, busy } = state;

  if (error && !start) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
        <ErrorState title="Could not start Cards" message={error} />
        <Link href="/" className="mt-4 text-center text-sm text-red-400 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!start) {
    return <GameShell title="Match the Cards">Loading…</GameShell>;
  }

  const tiles = buildCardTiles(start.cards, board);
  const finished = result !== null;

  return (
    <GameShell
      title="Match the Cards"
      subtitle={`Moves: ${board?.moves ?? 0} · Pairs: ${board?.matchedPairs ?? 0}/${board?.totalPairs ?? 6}`}
      expiresAt={start.expiresAt}
      onExpire={async () => {
        if (!result) {
          const res = await api.cardsFinish(actionId("cfin"));
          setState((s) => ({ ...s, result: res }));
        }
      }}
      footer={
        finished ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-6 text-center">
            <p className="text-lg font-semibold">
              {board?.status === "COMPLETED" ? "All pairs matched!" : "Time's up"}
            </p>
            {result ? (
              <p className="mt-1 text-slate-400">
                Score <span className="font-bold text-red-400">{result.score}</span> in{" "}
                {Math.round(result.timeMs / 1000)}s
              </p>
            ) : null}
            <Link href="/" className="mt-4 inline-block">
              <Button>Back to home</Button>
            </Link>
          </div>
        ) : null
      }
    >
      {error && !finished ? <div className="mb-3"><ErrorState title="Something went wrong" message={error} /></div> : null}
      {last?.matchCompleted ? (
        <p className="mb-3 text-center text-sm font-semibold text-green-400">Pair matched!</p>
      ) : last?.unmatchedFlipBack ? (
        <p className="mb-3 text-center text-sm font-semibold text-amber-400">Not a pair — try again</p>
      ) : null}

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {tiles.map((tile) => {
          const front = fronts[tile.card.id];
          return (
            <button
              key={tile.card.id}
              type="button"
              disabled={busy || finished || tile.faceUp}
              onClick={() => void flip(tile.card)}
              className={`relative aspect-[3/4] overflow-hidden rounded-md border transition ${
                tile.faceUp
                  ? tile.matched
                    ? "border-green-700"
                    : "border-red-500"
                  : "border-slate-700 hover:border-red-500"
              } disabled:opacity-90`}
            >
              {tile.faceUp && front ? (
                <img src={front} alt={tile.card.id} className="h-full w-full object-contain" />
              ) : (
                <img
                  src={start.backAssetUrl}
                  alt="card back"
                  className="h-full w-full object-contain opacity-80"
                />
              )}
            </button>
          );
        })}
      </div>
    </GameShell>
  );
}
