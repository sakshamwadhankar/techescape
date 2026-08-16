import type { Round } from "@spiderman/db";
import type {
  CardsMoveResponse,
  CardsResult,
  CardsStartResponse,
  GameFinishResponse,
} from "@spiderman/types";
import {
  CARDS_DECK_SLUGS,
  CARDS_PAIR_COUNT,
  SESSION_STATE_TTL_BUFFER_SECONDS,
} from "../constants";
import { getEnv } from "../env";
import { getJson, setJson } from "../redis";
import { assertCanStart } from "./round.service";
import {
  cacheAction,
  completeSession,
  createSession,
  findByTeam,
  getCachedAction,
  isExpired,
  readState,
  recordAction,
  remainingTtl,
  withLock,
  writeState,
} from "./sessions.service";
import {
  buildDeck,
  cardScore,
  flipCard,
  isAllMatched,
  toPublicState,
  type CardsDeck,
  type CardsState,
} from "./cards.domain";

const DECK_CACHE_TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_FINISH_KEY_PREFIX = "cards-timeout";

export async function cardsStart(teamId: string): Promise<CardsStartResponse> {
  const round = await assertCanStart("CARDS");
  const deck = await resolveDeck(round);
  const initialState: CardsState = {
    deck: deck.cards,
    matched: [],
    revealed: [],
    moves: 0,
    matchedPairs: 0,
    totalPairs: CARDS_PAIR_COUNT,
    startedAt: Date.now(),
  };
  const session = await createSession(teamId, "CARDS", initialState);
  return {
    sessionId: session.sessionId,
    expiresAt: session.expiresAt.toISOString(),
    cards: deck.cards.map((card) => ({ id: card.id, index: card.index })),
    backAssetUrl: deck.backAssetUrl,
  };
}

export async function cardsMove(
  teamId: string,
  cardId: string,
  clientActionId: string,
): Promise<CardsMoveResponse> {
  const session = await findByTeam(teamId, "CARDS");
  const sessionId = session.id;

  const cached = await getCachedAction(sessionId, clientActionId);
  if (cached) return cached as CardsMoveResponse;

  if (session.status !== "ACTIVE") {
    throw new Error(
      session.status === "COMPLETED" || session.status === "TIMEOUT"
        ? "Game already completed"
        : "Session is not active",
    );
  }

  const result = await withLock(sessionId, async () => {
    if (isExpired(session)) {
      const state = await readState<CardsState>(sessionId);
      const score = cardScore(state?.matchedPairs ?? 0, state?.moves ?? 0);
      const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
      const gameResult: CardsResult = {
        moves: state?.moves ?? 0,
        matchedPairs: state?.matchedPairs ?? 0,
        totalPairs: state?.totalPairs ?? CARDS_PAIR_COUNT,
        score,
        timeMs,
      };
      await completeSession(sessionId, {
        status: "TIMEOUT",
        score,
        timeMs,
        result: gameResult,
        finishKey: `${TIMEOUT_FINISH_KEY_PREFIX}:${sessionId}`,
      });
      return timeoutMoveResponse(clientActionId, cardId, state);
    }

    const state = await readState<CardsState>(sessionId);
    if (!state) throw new Error("Game already completed");

    const index = state.deck.findIndex((card) => card.id === cardId);
    if (index === -1) throw new Error("Unknown card");
    if (state.matched.includes(cardId)) {
      throw new Error("Card already matched");
    }
    if (state.revealed.includes(index)) {
      throw new Error("Card already revealed");
    }

    const card = state.deck[index]!;
    const outcome = flipCard(state, index);
    const completed = isAllMatched(outcome.next);
    const response: CardsMoveResponse = {
      moveId: clientActionId,
      cardId,
      frontAssetUrl: card.frontAssetUrl,
      revealed: outcome.revealed,
      matched: outcome.matched,
      matchCompleted: outcome.matchCompleted,
      unmatchedFlipBack: outcome.unmatchedFlipBack,
      state: toPublicState(outcome.next),
    };

    if (!completed) {
      await writeState(sessionId, outcome.next, remainingTtl(session));
    } else {
      const timeMs = Date.now() - state.startedAt;
      const score = cardScore(outcome.next.matchedPairs, outcome.next.moves);
      const gameResult: CardsResult = {
        moves: outcome.next.moves,
        matchedPairs: outcome.next.matchedPairs,
        totalPairs: outcome.next.totalPairs,
        score,
        timeMs,
      };
      await completeSession(sessionId, {
        status: "COMPLETED",
        score,
        timeMs,
        result: gameResult,
        finishKey: clientActionId,
      });
    }

    await recordAction(sessionId, clientActionId, "move", { cardId }, response);
    await cacheAction(sessionId, clientActionId, response);
    return response;
  });

  if (result === null) {
    throw new Error("Session is busy, please retry");
  }
  return result;
}

export async function cardsFinish(teamId: string, clientActionId: string): Promise<GameFinishResponse> {
  const session = await findByTeam(teamId, "CARDS");
  const sessionId = session.id;

  const cached = await getCachedAction(sessionId, clientActionId);
  if (cached) return cached as GameFinishResponse;

  if (session.status !== "ACTIVE") {
    if (session.status === "ABANDONED") {
      throw new Error("Session is not active");
    }
    const stored = (session.result as CardsResult | null) ?? null;
    return { score: session.score, timeMs: session.timeMs ?? stored?.timeMs ?? 0 };
  }

  const result = await withLock(sessionId, async () => {
    if (!isExpired(session)) {
      throw new Error("Game is still in progress");
    }
    const state = await readState<CardsState>(sessionId);
    const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
    const score = cardScore(state?.matchedPairs ?? 0, state?.moves ?? 0);
    const gameResult: CardsResult = {
      moves: state?.moves ?? 0,
      matchedPairs: state?.matchedPairs ?? 0,
      totalPairs: state?.totalPairs ?? CARDS_PAIR_COUNT,
      score,
      timeMs,
    };
    const completed = await completeSession(sessionId, {
      status: "TIMEOUT",
      score,
      timeMs,
      result: gameResult,
      finishKey: clientActionId,
    });
    const response: GameFinishResponse = {
      score: completed.score,
      timeMs: completed.timeMs ?? timeMs,
    };
    await recordAction(sessionId, clientActionId, "finish", {}, response);
    await cacheAction(sessionId, clientActionId, response);
    return response;
  });

  if (result === null) {
    throw new Error("Session is busy, please retry");
  }
  return result;
}

async function resolveDeck(round: Round): Promise<CardsDeck> {
  const deckKey = `cards:deck:round:${round.id}`;
  const cached = await getJson<CardsDeck>(deckKey);
  if (cached) return cached;

  const seed = await resolveSeed(round);
  const env = getEnv();
  const base = (env.ASSET_CDN_URL || env.WEB_ORIGIN || "").replace(/\/+$/, "");
  const deck = buildDeck(seed, CARDS_DECK_SLUGS, base);

  const ttl = round.expiresAt
    ? Math.max(
        60,
        Math.ceil((new Date(round.expiresAt).getTime() - Date.now()) / 1000) +
          SESSION_STATE_TTL_BUFFER_SECONDS,
      )
    : DECK_CACHE_TTL_SECONDS;
  await setJson(deckKey, deck, ttl);
  return deck;
}

async function resolveSeed(round: Round): Promise<number> {
  if (round.cardsSeed !== null) return round.cardsSeed;
  const seedKey = `cards:seed:round:${round.id}`;
  const cached = await getJson<number>(seedKey);
  if (cached !== null) return cached;
  const seed = Math.floor(Math.random() * 2 ** 31);
  await setJson(seedKey, seed, DECK_CACHE_TTL_SECONDS);
  return seed;
}

function timeoutMoveResponse(
  clientActionId: string,
  cardId: string,
  state: CardsState | null,
): CardsMoveResponse {
  return {
    moveId: clientActionId,
    cardId,
    frontAssetUrl: "",
    revealed: false,
    matched: false,
    matchCompleted: false,
    unmatchedFlipBack: false,
    state: {
      moves: state?.moves ?? 0,
      revealed: [],
      matched: state?.matched ?? [],
      matchedPairs: state?.matchedPairs ?? 0,
      totalPairs: state?.totalPairs ?? CARDS_PAIR_COUNT,
      status: "TIMEOUT",
    },
  };
}
