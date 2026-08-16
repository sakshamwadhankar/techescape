import type { Game, GameSession, SessionStatus } from "@spiderman/db";
import { Prisma } from "@spiderman/db";
import { prisma } from "../db";
import {
  del,
  delPattern,
  getJson,
  lrange,
  rpush,
  setJson,
  withLock as redisWithLock,
} from "../redis";
import {
  ACTION_LOCK_TTL_MS,
  IDEMPOTENCY_TTL_SECONDS,
  SESSION_STATE_TTL_BUFFER_SECONDS,
} from "../constants";
import { getEnv } from "../env";

export interface SessionPayload {
  sessionId: string;
  expiresAt: Date;
  startedAt: Date;
}

export interface CompletionInput {
  status: SessionStatus;
  score: number;
  timeMs: number;
  result: unknown;
  finishKey?: string;
}

const ACTIONS_QUEUE_PREFIX = "actions:session:";
const ACTIONS_QUEUE_TTL_SECONDS = 24 * 60 * 60;

function actionsQueueKey(sessionId: string): string {
  return `${ACTIONS_QUEUE_PREFIX}${sessionId}`;
}

export async function createSession(
  teamId: string,
  game: Game,
  initialState: unknown,
  durationSeconds?: number,
): Promise<SessionPayload> {
  const env = getEnv();
  const duration = durationSeconds ?? env.GAME_DURATION_SECONDS;
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + duration * 1000);

  const existing = await prisma.gameSession.findUnique({
    where: { teamId_game: { teamId, game } },
  });

  if (existing && existing.status === "ACTIVE") {
    return {
      sessionId: existing.id,
      expiresAt: existing.expiresAt,
      startedAt: existing.startedAt,
    };
  }
  if (existing && (existing.status === "COMPLETED" || existing.status === "TIMEOUT")) {
    throw new Error("This game has already been played and cannot be restarted");
  }

  let sessionId: string;
  let sessionRecord: GameSession;
  if (existing) {
    await prisma.gameAction.deleteMany({ where: { sessionId: existing.id } });
    await del(actionsQueueKey(existing.id));
    sessionRecord = await prisma.gameSession.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        startedAt,
        expiresAt,
        score: 0,
        timeMs: null,
        result: Prisma.JsonNull,
        finishKey: null,
        finishedAt: null,
      },
    });
    sessionId = existing.id;
  } else {
    try {
      sessionRecord = await prisma.gameSession.create({
        data: { teamId, game, startedAt, expiresAt },
      });
      sessionId = sessionRecord.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return createSession(teamId, game, initialState, durationSeconds);
      }
      throw error;
    }
  }

  await setJson(
    `state:${sessionId}`,
    initialState,
    duration + SESSION_STATE_TTL_BUFFER_SECONDS,
  );
  await setJson(
    sessionCacheKey(teamId, game),
    sessionRecord,
    duration + SESSION_STATE_TTL_BUFFER_SECONDS,
  );
  return { sessionId, expiresAt, startedAt };
}

export async function getActiveSession(
  sessionId: string,
  teamId: string,
  game: Game,
): Promise<GameSession> {
  const session = await prisma.gameSession.findFirst({
    where: { id: sessionId, teamId, game },
  });
  if (!session) throw new Error("Session not found");
  if (session.status !== "ACTIVE") {
    throw new Error(
      session.status === "COMPLETED" ? "Game already completed" : "Session is not active",
    );
  }
  return session;
}

export async function getActiveByTeam(teamId: string, game: Game): Promise<GameSession> {
  const session = await findByTeam(teamId, game);
  if (session.status !== "ACTIVE") {
    throw new Error("No active session for this game — start the game first");
  }
  return session;
}

export async function findByTeam(teamId: string, game: Game): Promise<GameSession> {
  const key = sessionCacheKey(teamId, game);
  const cached = await getJson<GameSession>(key);
  if (cached) return normalizeSession(cached);

  const session = await prisma.gameSession.findFirst({
    where: { teamId, game },
  });
  if (!session) throw new Error("Session not found");

  await setJson(key, session, remainingTtl(session));
  return session;
}

export function isExpired(session: Pick<GameSession, "expiresAt">, now = Date.now()): boolean {
  return new Date(session.expiresAt).getTime() <= now;
}

export function remainingTtl(session: Pick<GameSession, "expiresAt">, now = Date.now()): number {
  const remainingSec = Math.max(
    1,
    Math.ceil((new Date(session.expiresAt).getTime() - now) / 1000),
  );
  return remainingSec + SESSION_STATE_TTL_BUFFER_SECONDS;
}

export async function readState<T>(sessionId: string): Promise<T | null> {
  return getJson<T>(`state:${sessionId}`);
}

export async function writeState(sessionId: string, state: unknown, ttlSeconds: number): Promise<void> {
  await setJson(`state:${sessionId}`, state, ttlSeconds);
}

export async function getCachedAction(sessionId: string, clientActionId: string): Promise<unknown | null> {
  return getJson(`idem:${sessionId}:${clientActionId}`);
}

export async function cacheAction(sessionId: string, clientActionId: string, data: unknown): Promise<void> {
  await setJson(
    `idem:${sessionId}:${clientActionId}`,
    data,
    IDEMPOTENCY_TTL_SECONDS,
  );
}

export async function withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T | null> {
  return redisWithLock(`lock:${sessionId}`, ACTION_LOCK_TTL_MS, fn);
}

export async function completeSession(
  sessionId: string,
  input: CompletionInput,
): Promise<GameSession> {
  const existing = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });
  if (!existing) throw new Error("Session not found");

  if (existing.status !== "ACTIVE") return existing;

  if (input.status === "COMPLETED" && input.finishKey) {
    const dup = await prisma.gameSession.findUnique({
      where: { finishKey: input.finishKey },
    });
    if (dup) {
      await setJson(
        sessionCacheKey(dup.teamId, dup.game),
        dup,
        remainingTtl(dup),
      );
      return dup;
    }
  }

  const finishedAt = new Date();
  try {
    const updated = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: input.status,
        score: input.score,
        timeMs: input.timeMs,
        result: (input.result as object) ?? {},
        finishKey: input.finishKey ?? null,
        finishedAt,
      },
    });
    await del(`state:${sessionId}`, `lock:${sessionId}`);
    await setJson(
      sessionCacheKey(updated.teamId, updated.game),
      updated,
      remainingTtl(updated),
    );
    await flushSessionActions(sessionId);
    return updated;
  } catch (error) {
    const dup = await prisma.gameSession.findUnique({
      where: { finishKey: input.finishKey ?? "___none___" },
    });
    if (dup) {
      await setJson(
        sessionCacheKey(dup.teamId, dup.game),
        dup,
        remainingTtl(dup),
      );
      return dup;
    }
    throw error;
  }
}

export async function resetSession(sessionId: string): Promise<GameSession> {
  await prisma.gameAction.deleteMany({ where: { sessionId } });
  const session = await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: "ABANDONED",
      finishedAt: null,
      score: 0,
      timeMs: null,
      result: Prisma.JsonNull,
      finishKey: null,
    },
  });
  await del(
    `state:${sessionId}`,
    `lock:${sessionId}`,
    sessionCacheKey(session.teamId, session.game),
  );
  await delPattern(`idem:${sessionId}:*`);
  await flushSessionActions(sessionId);
  return session;
}

export async function recordAction(
  sessionId: string,
  clientActionId: string,
  type: string,
  payload: unknown,
  result: unknown,
): Promise<void> {
  try {
    await rpush(
      actionsQueueKey(sessionId),
      {
        clientActionId,
        type,
        payload: (payload as object) ?? {},
        result: (result as object) ?? {},
        createdAt: new Date().toISOString(),
      } satisfies QueuedAction,
      ACTIONS_QUEUE_TTL_SECONDS,
    );
  } catch {
    // Record action error should not break the move flow
  }
}

interface QueuedAction {
  clientActionId: string;
  type: string;
  payload: unknown;
  result: unknown;
  createdAt: string;
}

async function flushSessionActions(sessionId: string): Promise<void> {
  try {
    const queued = await lrange<QueuedAction>(actionsQueueKey(sessionId));
    if (queued.length === 0) return;
    await prisma.gameAction.createMany({
      data: queued.map((action) => ({
        sessionId,
        clientActionId: action.clientActionId,
        type: action.type,
        payload: (action.payload as object) ?? {},
        result: (action.result as object) ?? {},
      })),
    });
    await del(actionsQueueKey(sessionId));
  } catch {
    // Batch flush failure should not break the session terminal flow
  }
}

function sessionCacheKey(teamId: string, game: Game): string {
  return `session:team:${teamId}:${game}`;
}

function normalizeSession(session: GameSession): GameSession {
  return {
    ...session,
    startedAt: new Date(session.startedAt),
    expiresAt: new Date(session.expiresAt),
    finishedAt: session.finishedAt ? new Date(session.finishedAt) : null,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  };
}

