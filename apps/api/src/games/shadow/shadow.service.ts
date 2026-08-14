import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Round } from "@spiderman/db";
import type {
  GameFinishResponse,
  ShadowAnswerResponse,
  ShadowResult,
  ShadowStartResponse,
} from "@spiderman/types";
import {
  SESSION_STATE_TTL_BUFFER_SECONDS,
  SHADOW_MAX_ATTEMPTS_PER_QUESTION,
} from "../../common/constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";
import { RoundService } from "../../sessions/round.service";
import { SessionsService } from "../../sessions/sessions.service";
import {
  isAllResolved,
  matchesAnswer,
  questionScore,
  toPublicQuestion,
  type ShadowQuestionCache,
  type ShadowState,
} from "./shadow.domain";

const QUESTION_CACHE_TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_FINISH_KEY_PREFIX = "shadow-timeout";

@Injectable()
export class ShadowService {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(RoundService) private readonly roundService: RoundService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async start(teamId: string): Promise<ShadowStartResponse> {
    const round = await this.roundService.assertCanStart("SHADOW");
    const questions = await this.getRoundQuestions(round);
    const initialState: ShadowState = {
      questionIds: questions.map((q) => q.id),
      answers: questions.map((q) => q.correctAnswer),
      attemptsUsed: questions.map(() => 0),
      resolved: questions.map(() => false),
      totalCorrect: 0,
      totalScore: 0,
      startedAt: Date.now(),
      maxAttemptsPerQuestion: SHADOW_MAX_ATTEMPTS_PER_QUESTION,
    };
    const session = await this.sessions.createSession(teamId, "SHADOW", initialState);
    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt.toISOString(),
      questions: questions.map(toPublicQuestion),
      maxAttemptsPerQuestion: SHADOW_MAX_ATTEMPTS_PER_QUESTION,
    };
  }

  async answer(
    teamId: string,
    questionId: string,
    answer: string,
    clientActionId: string,
  ): Promise<ShadowAnswerResponse> {
    const session = await this.sessions.findByTeam(teamId, "SHADOW");
    const sessionId = session.id;

    const cached = await this.sessions.getCached(sessionId, clientActionId);
    if (cached) return cached as ShadowAnswerResponse;

    if (session.status !== "ACTIVE") {
      throw new ConflictException(
        session.status === "COMPLETED" || session.status === "TIMEOUT"
          ? "Game already completed"
          : "Session is not active",
      );
    }

    const result = await this.sessions.withLock(sessionId, async () => {
      if (this.sessions.isExpired(session)) {
        const state = await this.sessions.readState<ShadowState>(sessionId);
        const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
        const score = state?.totalScore ?? 0;
        const gameResult: ShadowResult = {
          correctCount: state?.totalCorrect ?? 0,
          questionCount: state?.questionIds.length ?? 0,
          score,
          timeMs,
        };
        await this.sessions.completeSession(sessionId, {
          status: "TIMEOUT",
          score,
          timeMs,
          result: gameResult,
          finishKey: `${TIMEOUT_FINISH_KEY_PREFIX}:${sessionId}`,
        });
        return this.timeoutResponse(state, questionId);
      }

      const state = await this.sessions.readState<ShadowState>(sessionId);
      if (!state) throw new ConflictException("Game already completed");

      const index = state.questionIds.indexOf(questionId);
      if (index === -1) throw new BadRequestException("Unknown question");
      if (state.resolved[index] ?? false) {
        throw new ConflictException("Question already resolved");
      }
      if ((state.attemptsUsed[index] ?? 0) >= state.maxAttemptsPerQuestion) {
        throw new ConflictException("Question attempts exhausted");
      }

      const correctAnswer = state.answers[index] ?? "";
      const correct = matchesAnswer(answer, correctAnswer);
      const attemptsUsed = (state.attemptsUsed[index] ?? 0) + 1;
      const attemptsLeft = state.maxAttemptsPerQuestion - attemptsUsed;
      const resolved = correct || attemptsLeft <= 0;
      const earned = correct ? questionScore(attemptsUsed) : 0;

      const next: ShadowState = {
        ...state,
        attemptsUsed: [...state.attemptsUsed],
        resolved: [...state.resolved],
      };
      next.attemptsUsed[index] = attemptsUsed;
      next.resolved[index] = resolved;
      if (correct) {
        next.totalCorrect += 1;
        next.totalScore += earned;
      }

      const completed = isAllResolved(next.resolved);
      const response: ShadowAnswerResponse = {
        questionId,
        questionIndex: index,
        correct,
        correctAnswer: correct ? correctAnswer : "",
        attemptsUsed,
        attemptsLeft,
        questionScore: earned,
        totalCorrect: next.totalCorrect,
        questionCount: state.questionIds.length,
        status: completed ? "COMPLETED" : "IN_PROGRESS",
      };

      if (!completed) {
        await this.sessions.writeState(sessionId, next, this.sessions.remainingTtl(session));
      } else {
        const timeMs = Date.now() - state.startedAt;
        const gameResult: ShadowResult = {
          correctCount: next.totalCorrect,
          questionCount: state.questionIds.length,
          score: next.totalScore,
          timeMs,
        };
        await this.sessions.completeSession(sessionId, {
          status: "COMPLETED",
          score: next.totalScore,
          timeMs,
          result: gameResult,
          finishKey: clientActionId,
        });
      }

      await this.sessions.recordAction(
        sessionId,
        clientActionId,
        "answer",
        { questionId, answer },
        response,
      );
      await this.sessions.cacheAction(sessionId, clientActionId, response);
      return response;
    });

    if (result === null) {
      throw new ConflictException("Session is busy, please retry");
    }
    return result;
  }

  async finish(teamId: string, clientActionId: string): Promise<GameFinishResponse> {
    const session = await this.sessions.findByTeam(teamId, "SHADOW");
    const sessionId = session.id;

    const cached = await this.sessions.getCached(sessionId, clientActionId);
    if (cached) return cached as GameFinishResponse;

    if (session.status !== "ACTIVE") {
      if (session.status === "ABANDONED") {
        throw new ConflictException("Session is not active");
      }
      const stored = (session.result as ShadowResult | null) ?? null;
      return { score: session.score, timeMs: session.timeMs ?? stored?.timeMs ?? 0 };
    }

    const result = await this.sessions.withLock(sessionId, async () => {
      if (!this.sessions.isExpired(session)) {
        throw new ConflictException("Game is still in progress");
      }
      const state = await this.sessions.readState<ShadowState>(sessionId);
      const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
      const score = state?.totalScore ?? 0;
      const gameResult: ShadowResult = {
        correctCount: state?.totalCorrect ?? 0,
        questionCount: state?.questionIds.length ?? 0,
        score,
        timeMs,
      };
      const completed = await this.sessions.completeSession(sessionId, {
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
      await this.sessions.recordAction(sessionId, clientActionId, "finish", {}, response);
      await this.sessions.cacheAction(sessionId, clientActionId, response);
      return response;
    });

    if (result === null) {
      throw new ConflictException("Session is busy, please retry");
    }
    return result;
  }

  /**
   * Active questions for the round, served from Redis after the first load so
   * hundreds of concurrent starts do not hit Postgres.
   */
  private async getRoundQuestions(round: Round): Promise<ShadowQuestionCache[]> {
    const key = `shadow:questions:round:${round.id}`;
    const cached = await this.redis.getJson<ShadowQuestionCache[]>(key);
    if (cached) return cached;

    const rows = await this.prisma.shadowQuestion.findMany({
      where: { active: true },
      orderBy: { slug: "asc" },
      select: { id: true, assetUrl: true, options: true, correctAnswer: true },
    });
    if (rows.length === 0) {
      throw new ConflictException("No shadow questions are configured");
    }
    const questions: ShadowQuestionCache[] = rows.map((q) => ({
      id: q.id,
      assetUrl: q.assetUrl,
      options: q.options as unknown as string[],
      correctAnswer: q.correctAnswer,
    }));

    const ttl = round.expiresAt
      ? Math.max(
          60,
          Math.ceil((new Date(round.expiresAt).getTime() - Date.now()) / 1000) +
            SESSION_STATE_TTL_BUFFER_SECONDS,
        )
      : QUESTION_CACHE_TTL_SECONDS;
    await this.redis.setJson(key, questions, ttl);
    return questions;
  }

  private timeoutResponse(
    state: ShadowState | null,
    questionId: string,
  ): ShadowAnswerResponse {
    const index = state?.questionIds.indexOf(questionId) ?? -1;
    return {
      questionId,
      questionIndex: index,
      correct: false,
      correctAnswer: "",
      attemptsUsed: 0,
      attemptsLeft: 0,
      questionScore: 0,
      totalCorrect: state?.totalCorrect ?? 0,
      questionCount: state?.questionIds.length ?? 0,
      status: "TIMEOUT",
    };
  }
}
