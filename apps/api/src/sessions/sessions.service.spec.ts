import type { ConfigService } from "@nestjs/config";
import type { GameSession } from "@spiderman/db";
import { SessionsService } from "./sessions.service";

describe("SessionsService", () => {
  let service: SessionsService;
  let prisma: any;
  let redis: any;
  let config: any;

  const mockSession: GameSession = {
    id: "session-123",
    teamId: "team-1",
    game: "CARDS",
    status: "ACTIVE",
    score: 0,
    timeMs: null,
    startedAt: new Date("2026-08-14T10:00:00Z"),
    expiresAt: new Date("2026-08-14T10:05:00Z"),
    finishedAt: null,
    finishKey: null,
    result: {},
    createdAt: new Date("2026-08-14T10:00:00Z"),
    updatedAt: new Date("2026-08-14T10:00:00Z"),
  };

  beforeEach(() => {
    prisma = {
      gameSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      gameAction: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    redis = {
      getJson: jest.fn(),
      setJson: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(undefined),
      withLock: jest.fn(),
    };

    config = {
      get: jest.fn().mockReturnValue(300),
    };

    service = new SessionsService(prisma, redis, config as unknown as ConfigService);
  });

  describe("findByTeam", () => {
    it("returns cached session from Redis and normalizes date strings", async () => {
      const cachedSessionStringDates = {
        ...mockSession,
        startedAt: "2026-08-14T10:00:00.000Z",
        expiresAt: "2026-08-14T10:05:00.000Z",
        createdAt: "2026-08-14T10:00:00.000Z",
        updatedAt: "2026-08-14T10:00:00.000Z",
      };
      redis.getJson.mockResolvedValue(cachedSessionStringDates);

      const session = await service.findByTeam("team-1", "CARDS");

      expect(redis.getJson).toHaveBeenCalledWith("session:team:team-1:CARDS");
      expect(prisma.gameSession.findFirst).not.toHaveBeenCalled();
      expect(session.id).toBe("session-123");
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it("fetches from DB on cache miss and caches in Redis", async () => {
      redis.getJson.mockResolvedValue(null);
      prisma.gameSession.findFirst.mockResolvedValue(mockSession);

      const session = await service.findByTeam("team-1", "CARDS");

      expect(prisma.gameSession.findFirst).toHaveBeenCalledWith({
        where: { teamId: "team-1", game: "CARDS" },
      });
      expect(redis.setJson).toHaveBeenCalledWith(
        "session:team:team-1:CARDS",
        mockSession,
        expect.any(Number),
      );
      expect(session).toEqual(mockSession);
    });
  });

  describe("createSession", () => {
    it("creates a new session and caches it in Redis", async () => {
      prisma.gameSession.findUnique.mockResolvedValue(null);
      prisma.gameSession.create.mockResolvedValue(mockSession);

      const payload = await service.createSession("team-1", "CARDS", { moves: 0 });

      expect(payload.sessionId).toBe("session-123");
      expect(redis.setJson).toHaveBeenCalledWith(
        "state:session-123",
        { moves: 0 },
        expect.any(Number),
      );
      expect(redis.setJson).toHaveBeenCalledWith(
        "session:team:team-1:CARDS",
        mockSession,
        expect.any(Number),
      );
    });
  });

  describe("completeSession", () => {
    it("updates DB and updates Redis session cache", async () => {
      prisma.gameSession.findUnique.mockResolvedValue(mockSession);
      const updatedSession = { ...mockSession, status: "COMPLETED" as const, score: 100 };
      prisma.gameSession.update.mockResolvedValue(updatedSession);

      const result = await service.completeSession("session-123", {
        status: "COMPLETED",
        score: 100,
        timeMs: 12000,
        result: { moves: 10 },
      });

      expect(result.status).toBe("COMPLETED");
      expect(redis.del).toHaveBeenCalledWith("state:session-123", "lock:session-123");
      expect(redis.setJson).toHaveBeenCalledWith(
        "session:team:team-1:CARDS",
        updatedSession,
        expect.any(Number),
      );
    });
  });

  describe("resetSession", () => {
    it("resets session in DB and deletes Redis session cache", async () => {
      const resetSessionObj = { ...mockSession, status: "ABANDONED" as const };
      prisma.gameSession.update.mockResolvedValue(resetSessionObj);

      await service.resetSession("session-123");

      expect(redis.del).toHaveBeenCalledWith(
        "state:session-123",
        "lock:session-123",
        "session:team:team-1:CARDS",
      );
      expect(redis.delPattern).toHaveBeenCalledWith("idem:session-123:*");
    });
  });
});
