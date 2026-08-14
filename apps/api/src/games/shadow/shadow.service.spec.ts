import { ConflictException } from "@nestjs/common";
import type { GameSession, Round } from "@spiderman/db";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { RedisService } from "../../common/redis/redis.service";
import type { RoundService } from "../../sessions/round.service";
import type { SessionsService } from "../../sessions/sessions.service";
import { type ShadowState } from "./shadow.domain";
import { ShadowService } from "./shadow.service";

const NOW = 1_700_000_000_000;

function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: "sess-1",
    teamId: "team-1",
    game: "SHADOW",
    status: "ACTIVE",
    startedAt: new Date(NOW),
    expiresAt: new Date(NOW + 300_000),
    score: 0,
    timeMs: null,
    result: null,
    finishKey: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  } as GameSession;
}

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: "round-1",
    number: 1,
    status: "ACTIVE",
    startedAt: null,
    pausedAt: null,
    expiresAt: null,
    wordleEnabled: true,
    shadowEnabled: true,
    cardsEnabled: true,
    wordleAnswer: null,
    cardsSeed: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  } as Round;
}

function makeState(overrides: Partial<ShadowState> = {}): ShadowState {
  return {
    questionIds: ["q1", "q2"],
    answers: ["Spider-Man", "Venom"],
    attemptsUsed: [0, 0],
    resolved: [false, false],
    totalCorrect: 0,
    totalScore: 0,
    startedAt: NOW,
    maxAttemptsPerQuestion: 3,
    ...overrides,
  };
}

function createService() {
  const sessions = {
    findByTeam: jest.fn(),
    getCached: jest.fn().mockResolvedValue(null),
    withLock: jest.fn(async (_sessionId: string, fn: () => Promise<unknown>) => fn()),
    isExpired: jest.fn().mockReturnValue(false),
    remainingTtl: jest.fn().mockReturnValue(1000),
    readState: jest.fn(),
    writeState: jest.fn().mockResolvedValue(undefined),
    recordAction: jest.fn().mockResolvedValue(undefined),
    cacheAction: jest.fn().mockResolvedValue(undefined),
    completeSession: jest.fn(),
    createSession: jest.fn(),
  };
  const roundService = { assertCanStart: jest.fn() };
  const redis = { getJson: jest.fn(), setJson: jest.fn() };
  const prisma = { shadowQuestion: { findMany: jest.fn() } };
  const service = new ShadowService(
    sessions as unknown as SessionsService,
    roundService as unknown as RoundService,
    redis as unknown as RedisService,
    prisma as unknown as PrismaService,
  );
  return { service, sessions, roundService, redis, prisma };
}

describe("ShadowService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("start", () => {
    it("does not expose the correct answer in the questions payload", async () => {
      const { service, sessions, roundService, redis, prisma } = createService();
      roundService.assertCanStart.mockResolvedValue(makeRound());
      redis.getJson.mockResolvedValue(null);
      prisma.shadowQuestion.findMany.mockResolvedValue([
        {
          id: "q1",
          assetUrl: "/assets/shadow/spiderman.webp",
          options: ["Spider-Man", "Venom", "Carnage"],
          correctAnswer: "Spider-Man",
        },
      ]);
      sessions.createSession.mockResolvedValue({
        sessionId: "sess-1",
        expiresAt: new Date(NOW + 300_000),
        startedAt: new Date(NOW),
      });

      const res = await service.start("team-1");

      expect(res.questions).toEqual([
        { id: "q1", assetUrl: "/assets/shadow/spiderman.webp", options: ["Spider-Man", "Venom", "Carnage"] },
      ]);
    });
  });

  describe("answer", () => {
    it("returns the correct answer when the submission is correct", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(makeState());

      const res = await service.answer("team-1", "q1", "Spider-Man", "action-12345");

      expect(res.correct).toBe(true);
      expect(res.correctAnswer).toBe("Spider-Man");
      expect(res.status).toBe("IN_PROGRESS");
      expect(sessions.completeSession).not.toHaveBeenCalled();
    });

    it("does not reveal the correct answer on a wrong answer", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(makeState());

      const res = await service.answer("team-1", "q1", "Venom", "action-12345");

      expect(res.correct).toBe(false);
      expect(res.correctAnswer).toBe("");
      expect(res.attemptsLeft).toBe(2);
    });

    it("does not reveal the correct answer when the last attempt is wrong", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(
        makeState({ attemptsUsed: [2, 0], resolved: [false, false] }),
      );
      sessions.completeSession.mockImplementation(async (_id: string, input: unknown) => ({
        ...makeSession(),
        status: (input as { status: string }).status,
        score: (input as { score: number }).score,
        timeMs: (input as { timeMs: number }).timeMs,
      }));

      const res = await service.answer("team-1", "q1", "Venom", "action-12345");

      expect(res.correct).toBe(false);
      expect(res.correctAnswer).toBe("");
      expect(res.attemptsLeft).toBe(0);
      expect(res.status).toBe("IN_PROGRESS");
    });

    it("throws a conflict when the session lock is busy", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.withLock.mockResolvedValue(null);

      await expect(service.answer("team-1", "q1", "Venom", "action-12345")).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
