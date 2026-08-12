import type { Round } from "@spiderman/db";
import type { RedisService } from "../common/redis/redis.service";
import type { RoundService } from "../sessions/round.service";
import type { PrismaService } from "../common/prisma/prisma.service";
import { LeaderboardService } from "./leaderboard.service";

const NOW = 1_700_000_000_000;

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: "round-1",
    number: 1,
    status: "ACTIVE",
    startedAt: new Date(NOW),
    pausedAt: null,
    expiresAt: new Date(NOW + 600_000),
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

function createService() {
  const prisma = {
    team: { findUnique: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const roundService = { getRound: jest.fn() };
  const redis = { getJson: jest.fn(), setJson: jest.fn() };
  const service = new LeaderboardService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    roundService as unknown as RoundService,
  );
  return { service, prisma, roundService, redis };
}

function makeRow(overrides: Partial<LeaderboardServiceRow> = {}): LeaderboardServiceRow {
  return {
    teamCode: "T1",
    teamName: "Team One",
    totalScore: 300,
    totalTimeMs: 120000,
    gamesCompleted: 2,
    ...overrides,
  };
}

interface LeaderboardServiceRow {
  teamCode: string;
  teamName: string;
  totalScore: number;
  totalTimeMs: number;
  gamesCompleted: number;
}

describe("LeaderboardService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("top", () => {
    it("computes ranked entries and caches them", async () => {
      const { service, prisma, roundService, redis } = createService();
      roundService.getRound.mockResolvedValue(makeRound());
      prisma.$queryRaw.mockResolvedValue([
        makeRow({ teamCode: "T2", totalScore: 400, totalTimeMs: 90000, gamesCompleted: 3 }),
        makeRow({ teamCode: "T1", totalScore: 300 }),
      ]);
      prisma.team.count.mockResolvedValue(5);

      const res = await service.top(50);

      expect(res.entries.map((e) => e.rank)).toEqual([1, 2]);
      expect(res.entries[0]).toMatchObject({ teamCode: "T2", totalScore: 400 });
      expect(res.totalTeams).toBe(5);
      expect(redis.setJson).toHaveBeenCalledWith(
        "leaderboard:round:round-1",
        res,
        5,
      );
      expect(
        (prisma.$queryRaw.mock.calls[0][0] as { strings: string[] }).strings.join(""),
      ).toContain("GameSession");
    });

    it("returns the cached value without querying", async () => {
      const { service, roundService, redis, prisma } = createService();
      roundService.getRound.mockResolvedValue(makeRound());
      const cached = {
        entries: [{ ...makeRow(), rank: 1 }],
        totalTeams: 3,
      };
      redis.getJson.mockResolvedValue(cached);

      const res = await service.top(10);

      expect(res).toEqual(cached);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("me", () => {
    it("returns the team's rank and entry", async () => {
      const { service, prisma } = createService();
      prisma.team.findUnique.mockResolvedValue({ code: "T1" });
      prisma.$queryRaw.mockResolvedValue([
        makeRow({ teamCode: "T2", totalScore: 400 }),
        makeRow({ teamCode: "T1" }),
      ]);

      const res = await service.me("team-1");

      expect(res.rank).toBe(2);
      expect(res.entry).toMatchObject({ teamCode: "T1", totalScore: 300 });
    });

    it("returns null rank/entry when the team has no scores", async () => {
      const { service, prisma } = createService();
      prisma.team.findUnique.mockResolvedValue({ code: "NOSCORE" });
      prisma.$queryRaw.mockResolvedValue([makeRow({ teamCode: "T2" })]);

      const res = await service.me("team-1");

      expect(res).toEqual({ rank: null, entry: null });
    });

    it("returns null rank/entry for an unknown team", async () => {
      const { service, prisma } = createService();
      prisma.team.findUnique.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([]);

      const res = await service.me("team-1");

      expect(res).toEqual({ rank: null, entry: null });
    });
  });
});
