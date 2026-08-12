import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
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
} from "../../common/constants";
import { RedisService } from "../../common/redis/redis.service";
import { RoundService } from "../../sessions/round.service";
import { SessionsService } from "../../sessions/sessions.service";
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

@Injectable()
export class WordleService {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(RoundService) private readonly roundService: RoundService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async start(teamId: string): Promise<WordleStartResponse> {
    const round = await this.roundService.assertCanStart("WORDLE");
    const answer = await this.resolveAnswer(round);
    const initialState: WordleState = {
      word: answer,
      guesses: [],
      status: "IN_PROGRESS",
      startedAt: Date.now(),
      wordLength: WORDLE_WORD_LENGTH,
      attemptsAllowed: WORDLE_MAX_ATTEMPTS,
    };
    const session = await this.sessions.createSession(teamId, "WORDLE", initialState);
    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt.toISOString(),
      attemptsAllowed: WORDLE_MAX_ATTEMPTS,
      wordLength: WORDLE_WORD_LENGTH,
    };
  }

  async guess(
    teamId: string,
    guess: string,
    clientActionId: string,
  ): Promise<WordleGuessResponse> {
    const session = await this.sessions.findByTeam(teamId, "WORDLE");
    const sessionId = session.id;

    const cached = await this.sessions.getCached(sessionId, clientActionId);
    if (cached) return cached as WordleGuessResponse;

    if (!isValidWord(guess)) {
      throw new BadRequestException("Not a valid English word");
    }

    if (session.status !== "ACTIVE") {
      throw new ConflictException(
        session.status === "COMPLETED" || session.status === "TIMEOUT"
          ? "Game already completed"
          : "Session is not active",
      );
    }

    const result = await this.sessions.withLock(sessionId, async () => {
      if (this.sessions.isExpired(session)) {
        const state = await this.sessions.readState<WordleState>(sessionId);
        const guessCount = state?.guesses.length ?? 0;
        const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
        const gameResult: WordleResult = {
          status: "TIMEOUT",
          guesses: state?.guesses ?? [],
          won: false,
          score: 0,
          timeMs,
        };
        await this.sessions.completeSession(sessionId, {
          status: "TIMEOUT",
          score: 0,
          timeMs,
          result: gameResult,
          finishKey: `${TIMEOUT_FINISH_KEY_PREFIX}:${sessionId}`,
        });
        return this.timeoutGuessResponse(guessCount);
      }

      const state = await this.sessions.readState<WordleState>(sessionId);
      if (!state || state.status !== "IN_PROGRESS") {
        throw new ConflictException("Game already completed");
      }
      if (state.wordLength !== guess.length) {
        throw new BadRequestException(`Guess must be ${state.wordLength} letters`);
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
        await this.sessions.writeState(
          sessionId,
          { ...state, guesses },
          this.remainingTtl(session),
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
        await this.sessions.completeSession(sessionId, {
          status: "COMPLETED",
          score,
          timeMs,
          result: gameResult,
          finishKey: clientActionId,
        });
      }

      await this.sessions.recordAction(sessionId, clientActionId, "guess", { guess }, response);
      await this.sessions.cacheAction(sessionId, clientActionId, response);
      return response;
    });

    if (result === null) {
      throw new ConflictException("Session is busy, please retry");
    }
    return result;
  }

  async finish(teamId: string, clientActionId: string): Promise<GameFinishResponse> {
    const session = await this.sessions.findByTeam(teamId, "WORDLE");
    const sessionId = session.id;

    const cached = await this.sessions.getCached(sessionId, clientActionId);
    if (cached) return cached as GameFinishResponse;

    if (session.status !== "ACTIVE") {
      if (session.status === "ABANDONED") {
        throw new ConflictException("Session is not active");
      }
      return { score: session.score, timeMs: session.timeMs ?? 0 };
    }

    const result = await this.sessions.withLock(sessionId, async () => {
      if (!this.sessions.isExpired(session)) {
        throw new ConflictException("Game is still in progress");
      }
      const state = await this.sessions.readState<WordleState>(sessionId);
      const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
      const gameResult: WordleResult = {
        status: "TIMEOUT",
        guesses: state?.guesses ?? [],
        won: false,
        score: 0,
        timeMs,
      };
      const completed = await this.sessions.completeSession(sessionId, {
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
      await this.sessions.recordAction(sessionId, clientActionId, "finish", {}, response);
      await this.sessions.cacheAction(sessionId, clientActionId, response);
      return response;
    });

    if (result === null) {
      throw new ConflictException("Session is busy, please retry");
    }
    return result;
  }

  private async resolveAnswer(round: Round): Promise<string> {
    if (round.wordleAnswer) return round.wordleAnswer.toLowerCase();
    const key = `wordle:answer:round:${round.id}`;
    const cached = await this.redis.getJson<string>(key);
    if (cached) return cached;
    const answer = pickRandomAnswer();
    const ttl = round.expiresAt
      ? Math.max(
          60,
          Math.ceil((new Date(round.expiresAt).getTime() - Date.now()) / 1000) +
            SESSION_STATE_TTL_BUFFER_SECONDS,
        )
      : ANSWER_CACHE_TTL_SECONDS;
    await this.redis.setJson(key, answer, ttl);
    return answer;
  }

  private remainingTtl(session: { expiresAt: Date }): number {
    const remainingSec = Math.max(
      1,
      Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
    );
    return remainingSec + SESSION_STATE_TTL_BUFFER_SECONDS;
  }

  private timeoutGuessResponse(guessCount: number): WordleGuessResponse {
    return { guessCount, attemptsLeft: 0, feedback: [], wordleStatus: "TIMEOUT" };
  }
}
