import type { Round } from "@spiderman/db";
import type {
  GameFinishResponse,
  WordleGuessResponse,
  WordleResult,
  WordleStartResponse,
  WordleStatus,
} from "@spiderman/types";
import {
  SESSION_STATE_TTL_BUFFER_SECONDS,
  WORDLE_MAX_ATTEMPTS,
  WORDLE_WORD_LENGTH,
} from "../constants";
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
  calculateWordleScore,
  evaluateGuess,
  isWinningFeedback,
  isValidWord,
  pickRandomAnswer,
  type WordleState,
} from "./wordle.domain";

const ANSWER_CACHE_TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_FINISH_KEY_PREFIX = "wordle-timeout";

export async function wordleStart(teamId: string): Promise<WordleStartResponse> {
  const round = await assertCanStart("WORDLE");
  const answer = await resolveAnswer(round);
  const initialState: WordleState = {
    word: answer,
    guesses: [],
    status: "IN_PROGRESS",
    startedAt: Date.now(),
    wordLength: WORDLE_WORD_LENGTH,
    attemptsAllowed: WORDLE_MAX_ATTEMPTS,
  };
  const session = await createSession(teamId, "WORDLE", initialState);
  return {
    sessionId: session.sessionId,
    expiresAt: session.expiresAt.toISOString(),
    attemptsAllowed: WORDLE_MAX_ATTEMPTS,
    wordLength: WORDLE_WORD_LENGTH,
  };
}

export async function wordleGuess(
  teamId: string,
  guess: string,
  clientActionId: string,
): Promise<WordleGuessResponse> {
  const session = await findByTeam(teamId, "WORDLE");
  const sessionId = session.id;

  const cached = await getCachedAction(sessionId, clientActionId);
  if (cached) return cached as WordleGuessResponse;

  if (!isValidWord(guess)) {
    throw new Error("Not a valid English word");
  }

  if (session.status !== "ACTIVE") {
    throw new Error(
      session.status === "COMPLETED" || session.status === "TIMEOUT"
        ? "Game already completed"
        : "Session is not active",
    );
  }

  const result = await withLock(sessionId, async () => {
    if (isExpired(session)) {
      const state = await readState<WordleState>(sessionId);
      const guessCount = state?.guesses.length ?? 0;
      const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
      const gameResult: WordleResult = {
        status: "TIMEOUT",
        guesses: state?.guesses ?? [],
        won: false,
        score: 0,
        timeMs,
      };
      await completeSession(sessionId, {
        status: "TIMEOUT",
        score: 0,
        timeMs,
        result: gameResult,
        finishKey: `${TIMEOUT_FINISH_KEY_PREFIX}:${sessionId}`,
      });
      return timeoutGuessResponse(guessCount);
    }

    const state = await readState<WordleState>(sessionId);
    if (!state || state.status !== "IN_PROGRESS") {
      throw new Error("Game already completed");
    }
    if (state.wordLength !== guess.length) {
      throw new Error(`Guess must be ${state.wordLength} letters`);
    }

    const feedback = evaluateGuess(guess, state.word);
    const guesses = [...state.guesses, guess];
    const guessCount = guesses.length;
    const attemptsLeft = state.attemptsAllowed - guessCount;
    const won = isWinningFeedback(feedback);
    const wordleStatus: WordleStatus =
      won ? "WON" : attemptsLeft <= 0 ? "LOST" : "IN_PROGRESS";

    const response: WordleGuessResponse = {
      guessCount,
      attemptsLeft: Math.max(0, attemptsLeft),
      feedback,
      wordleStatus,
    };

    if (wordleStatus === "IN_PROGRESS") {
      await writeState(
        sessionId,
        { ...state, guesses },
        remainingTtl(session),
      );
    } else {
      const timeMs = Date.now() - state.startedAt;
      const score = won ? calculateWordleScore(guessCount) : 0;
      const gameResult: WordleResult = {
        status: wordleStatus,
        guesses,
        won,
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

    await recordAction(sessionId, clientActionId, "guess", { guess }, response);
    await cacheAction(sessionId, clientActionId, response);
    return response;
  });

  if (result === null) {
    throw new Error("Session is busy, please retry");
  }
  return result;
}

export async function wordleFinish(teamId: string, clientActionId: string): Promise<GameFinishResponse> {
  const session = await findByTeam(teamId, "WORDLE");
  const sessionId = session.id;

  const cached = await getCachedAction(sessionId, clientActionId);
  if (cached) return cached as GameFinishResponse;

  if (session.status !== "ACTIVE") {
    if (session.status === "ABANDONED") {
      throw new Error("Session is not active");
    }
    return { score: session.score, timeMs: session.timeMs ?? 0 };
  }

  const result = await withLock(sessionId, async () => {
    if (!isExpired(session)) {
      throw new Error("Game is still in progress");
    }
    const state = await readState<WordleState>(sessionId);
    const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
    const gameResult: WordleResult = {
      status: "TIMEOUT",
      guesses: state?.guesses ?? [],
      won: false,
      score: 0,
      timeMs,
    };
    const completed = await completeSession(sessionId, {
      status: "TIMEOUT",
      score: 0,
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

async function resolveAnswer(round: Round): Promise<string> {
  if (round.wordleAnswer) return round.wordleAnswer.toLowerCase();
  const key = `wordle:answer:round:${round.id}`;
  const cached = await getJson<string>(key);
  if (cached) return cached;
  const answer = pickRandomAnswer();
  const ttl = round.expiresAt
    ? Math.max(
        60,
        Math.ceil((new Date(round.expiresAt).getTime() - Date.now()) / 1000) +
          SESSION_STATE_TTL_BUFFER_SECONDS,
      )
    : ANSWER_CACHE_TTL_SECONDS;
  await setJson(key, answer, ttl);
  return answer;
}

function timeoutGuessResponse(guessCount: number): WordleGuessResponse {
  return { guessCount, attemptsLeft: 0, feedback: [], wordleStatus: "TIMEOUT" };
}
