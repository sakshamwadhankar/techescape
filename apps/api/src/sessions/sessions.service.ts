import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Game, GameSession, SessionStatus } from "@spiderman/db";
import { Prisma } from "@spiderman/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import {
  ACTION_LOCK_TTL_MS,
  IDEMPOTENCY_TTL_SECONDS,
  SESSION_STATE_TTL_BUFFER_SECONDS,
} from "../common/constants";

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

@Injectable()
export class SessionsService {
  private readonly defaultDurationSeconds: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.defaultDurationSeconds = config.get<number>("GAME_DURATION_SECONDS", 300);
  }

  /**
   * Create (or re-open) a session for a team + game. Exactly one session row
   * exists per (teamId, game) — guaranteed by the unique constraint.
   */
  async createSession(
    teamId: string,
    game: Game,
    initialState: unknown,
    durationSeconds?: number,
  ): Promise<SessionPayload> {
    const duration = durationSeconds ?? this.defaultDurationSeconds;
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + duration * 1000);

    const existing = await this.prisma.gameSession.findUnique({
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
      throw new ConflictException(
        "This game has already been played and cannot be restarted",
      );
    }

    let sessionId: string;
    let sessionRecord: GameSession;
    if (existing) {
      // ABANDONED → reset for a fresh attempt.
      await this.prisma.gameAction.deleteMany({ where: { sessionId: existing.id } });
      sessionRecord = await this.prisma.gameSession.update({
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
        sessionRecord = await this.prisma.gameSession.create({
          data: { teamId, game, startedAt, expiresAt },
        });
        sessionId = sessionRecord.id;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          // A race condition occurred where the session was created between our check and create.
          // Retry to fetch and return the correct state.
          return this.createSession(teamId, game, initialState, durationSeconds);
        }
        throw error;
      }
    }

    await this.redis.setJson(
      `state:${sessionId}`,
      initialState,
      duration + SESSION_STATE_TTL_BUFFER_SECONDS,
    );
    await this.redis.setJson(
      this.sessionCacheKey(teamId, game),
      sessionRecord,
      duration + SESSION_STATE_TTL_BUFFER_SECONDS,
    );
    return { sessionId, expiresAt, startedAt };
  }

  async getActive(
    sessionId: string,
    teamId: string,
    game: Game,
  ): Promise<GameSession> {
    const session = await this.prisma.gameSession.findFirst({
      where: { id: sessionId, teamId, game },
    });
    if (!session) throw new NotFoundException("Session not found");
    if (session.status !== "ACTIVE") {
      throw new ConflictException(
        session.status === "COMPLETED" ? "Game already completed" : "Session is not active",
      );
    }
    return session;
  }

  /** The active session for a team + game. One exists per (teamId, game). */
  async getActiveByTeam(teamId: string, game: Game): Promise<GameSession> {
    const session = await this.findByTeam(teamId, game);
    if (session.status !== "ACTIVE") {
      throw new NotFoundException("No active session for this game — start the game first");
    }
    return session;
  }

  /** Any session (any status) for a team + game. */
  async findByTeam(teamId: string, game: Game): Promise<GameSession> {
    const key = this.sessionCacheKey(teamId, game);
    const cached = await this.redis.getJson<GameSession>(key);
    if (cached) return this.normalizeSession(cached);

    const session = await this.prisma.gameSession.findFirst({
      where: { teamId, game },
    });
    if (!session) throw new NotFoundException("Session not found");

    await this.redis.setJson(key, session, this.remainingTtl(session));
    return session;
  }

  isExpired(session: Pick<GameSession, "expiresAt">, now = Date.now()): boolean {
    return new Date(session.expiresAt).getTime() <= now;
  }

  /** Seconds left until expiry plus a buffer, for state TTLs. */
  remainingTtl(session: Pick<GameSession, "expiresAt">, now = Date.now()): number {
    const remainingSec = Math.max(
      1,
      Math.ceil((new Date(session.expiresAt).getTime() - now) / 1000),
    );
    return remainingSec + SESSION_STATE_TTL_BUFFER_SECONDS;
  }

  async readState<T>(sessionId: string): Promise<T | null> {
    return this.redis.getJson<T>(`state:${sessionId}`);
  }

  async writeState(sessionId: string, state: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.setJson(`state:${sessionId}`, state, ttlSeconds);
  }

  async getCached(sessionId: string, clientActionId: string): Promise<unknown | null> {
    return this.redis.getJson(`idem:${sessionId}:${clientActionId}`);
  }

  async cacheAction(sessionId: string, clientActionId: string, data: unknown): Promise<void> {
    await this.redis.setJson(
      `idem:${sessionId}:${clientActionId}`,
      data,
      IDEMPOTENCY_TTL_SECONDS,
    );
  }

  /** Acquire the per-session mutex and run fn. Returns null if busy. */
  async withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T | null> {
    return this.redis.withLock(`lock:${sessionId}`, ACTION_LOCK_TTL_MS, fn);
  }

  /** Idempotent, atomic session finalization. */
  async completeSession(
    sessionId: string,
    input: CompletionInput,
  ): Promise<GameSession> {
    const existing = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
    });
    if (!existing) throw new NotFoundException("Session not found");

    if (existing.status !== "ACTIVE") return existing;

    if (input.status === "COMPLETED" && input.finishKey) {
      const dup = await this.prisma.gameSession.findUnique({
        where: { finishKey: input.finishKey },
      });
      if (dup) {
        await this.redis.setJson(
          this.sessionCacheKey(dup.teamId, dup.game),
          dup,
          this.remainingTtl(dup),
        );
        return dup;
      }
    }

    const finishedAt = new Date();
    try {
      const updated = await this.prisma.gameSession.update({
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
      await this.redis.del(`state:${sessionId}`, `lock:${sessionId}`);
      await this.redis.setJson(
        this.sessionCacheKey(updated.teamId, updated.game),
        updated,
        this.remainingTtl(updated),
      );
      return updated;
    } catch (error) {
      const dup = await this.prisma.gameSession.findUnique({
        where: { finishKey: input.finishKey ?? "___none___" },
      });
      if (dup) {
        await this.redis.setJson(
          this.sessionCacheKey(dup.teamId, dup.game),
          dup,
          this.remainingTtl(dup),
        );
        return dup;
      }
      throw error;
    }
  }

  /** Admin: allow a team to replay a game. */
  async resetSession(sessionId: string): Promise<GameSession> {
    await this.prisma.gameAction.deleteMany({ where: { sessionId } });
    const session = await this.prisma.gameSession.update({
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
    await this.redis.del(
      `state:${sessionId}`,
      `lock:${sessionId}`,
      this.sessionCacheKey(session.teamId, session.game),
    );
    await this.redis.delPattern(`idem:${sessionId}:*`);
    return session;
  }

  async recordAction(
    sessionId: string,
    clientActionId: string,
    type: string,
    payload: unknown,
    result: unknown,
  ): Promise<void> {
    try {
      await this.prisma.gameAction.create({
        data: {
          sessionId,
          clientActionId,
          type,
          payload: (payload as object) ?? {},
          result: (result as object) ?? {},
        },
      });
    } catch {
      // Record action error should not break the move flow
    }
  }

  private sessionCacheKey(teamId: string, game: Game): string {
    return `session:team:${teamId}:${game}`;
  }

  private normalizeSession(session: GameSession): GameSession {
    return {
      ...session,
      startedAt: new Date(session.startedAt),
      expiresAt: new Date(session.expiresAt),
      finishedAt: session.finishedAt ? new Date(session.finishedAt) : null,
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
    };
  }

}
