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
} from "../constants";
import { prisma } from "../db";
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
  isAllResolved,
  matchesAnswer,
  questionScore,
  toPublicQuestion,
  type ShadowQuestionCache,
  type ShadowState,
} from "./shadow.domain";

const QUESTION_CACHE_TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_FINISH_KEY_PREFIX = "shadow-timeout";

export async function shadowStart(teamId: string): Promise<ShadowStartResponse> {
  const round = await assertCanStart("SHADOW");
  const questions = await getRoundQuestions(round);
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
  const session = await createSession(teamId, "SHADOW", initialState);
  return {
    sessionId: session.sessionId,
    expiresAt: session.expiresAt.toISOString(),
    questions: questions.map(toPublicQuestion),
    maxAttemptsPerQuestion: SHADOW_MAX_ATTEMPTS_PER_QUESTION,
  };
}

export async function shadowAnswer(
  teamId: string,
  questionId: string,
  answer: string,
  clientActionId: string,
): Promise<ShadowAnswerResponse> {
  const session = await findByTeam(teamId, "SHADOW");
  const sessionId = session.id;

  const cached = await getCachedAction(sessionId, clientActionId);
  if (cached) return cached as ShadowAnswerResponse;

  if (session.status !== "ACTIVE") {
    throw new Error(
      session.status === "COMPLETED" || session.status === "TIMEOUT"
        ? "Game already completed"
        : "Session is not active",
    );
  }

  const result = await withLock(sessionId, async () => {
    if (isExpired(session)) {
      const state = await readState<ShadowState>(sessionId);
      const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
      const score = state?.totalScore ?? 0;
      const gameResult: ShadowResult = {
        correctCount: state?.totalCorrect ?? 0,
        questionCount: state?.questionIds.length ?? 0,
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
      return timeoutResponse(state, questionId);
    }

    const state = await readState<ShadowState>(sessionId);
    if (!state) throw new Error("Game already completed");

    const index = state.questionIds.indexOf(questionId);
    if (index === -1) throw new Error("Unknown question");
    if (state.resolved[index] ?? false) {
      throw new Error("Question already resolved");
    }
    if ((state.attemptsUsed[index] ?? 0) >= state.maxAttemptsPerQuestion) {
      throw new Error("Question attempts exhausted");
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
      await writeState(sessionId, next, remainingTtl(session));
    } else {
      const timeMs = Date.now() - state.startedAt;
      const gameResult: ShadowResult = {
        correctCount: next.totalCorrect,
        questionCount: state.questionIds.length,
        score: next.totalScore,
        timeMs,
      };
      await completeSession(sessionId, {
        status: "COMPLETED",
        score: next.totalScore,
        timeMs,
        result: gameResult,
        finishKey: clientActionId,
      });
    }

    await recordAction(
      sessionId,
      clientActionId,
      "answer",
      { questionId, answer },
      response,
    );
    await cacheAction(sessionId, clientActionId, response);
    return response;
  });

  if (result === null) {
    throw new Error("Session is busy, please retry");
  }
  return result;
}

export async function shadowFinish(teamId: string, clientActionId: string): Promise<GameFinishResponse> {
  const session = await findByTeam(teamId, "SHADOW");
  const sessionId = session.id;

  const cached = await getCachedAction(sessionId, clientActionId);
  if (cached) return cached as GameFinishResponse;

  if (session.status !== "ACTIVE") {
    if (session.status === "ABANDONED") {
      throw new Error("Session is not active");
    }
    const stored = (session.result as ShadowResult | null) ?? null;
    return { score: session.score, timeMs: session.timeMs ?? stored?.timeMs ?? 0 };
  }

  const result = await withLock(sessionId, async () => {
    if (!isExpired(session)) {
      throw new Error("Game is still in progress");
    }
    const state = await readState<ShadowState>(sessionId);
    const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
    const score = state?.totalScore ?? 0;
    const gameResult: ShadowResult = {
      correctCount: state?.totalCorrect ?? 0,
      questionCount: state?.questionIds.length ?? 0,
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

async function getRoundQuestions(round: Round): Promise<ShadowQuestionCache[]> {
  const key = `shadow:questions:round:${round.id}`;
  const cached = await getJson<ShadowQuestionCache[]>(key);
  if (cached) return cached;

  const rows = await prisma.shadowQuestion.findMany({
    where: { active: true },
    orderBy: { slug: "asc" },
    select: { id: true, assetUrl: true, options: true, correctAnswer: true },
  });
  if (rows.length === 0) {
    throw new Error("No shadow questions are configured");
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
  await setJson(key, questions, ttl);
  return questions;
}

function timeoutResponse(
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
