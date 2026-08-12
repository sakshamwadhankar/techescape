import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { GameSession, Round, Team } from "@spiderman/db";
import type { RoundService } from "../sessions/round.service";
import type { SessionsService } from "../sessions/sessions.service";
import type { PrismaService } from "../common/prisma/prisma.service";
import { AdminService } from "./admin.service";

const NOW = 1_700_000_000_000;

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: "round-1",
    number: 1,
    status: "IDLE",
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

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "team-1",
    code: "TEAM1",
    accessCode: "team1",
    name: "Team One",
    memberNames: ["Alice"],
    room: null,
    createdAt: new Date(NOW),
    ...overrides,
  } as Team;
}

function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: "sess-1",
    teamId: "team-1",
    game: "WORDLE",
    status: "COMPLETED",
    startedAt: new Date(NOW),
    expiresAt: new Date(NOW + 300_000),
    finishedAt: new Date(NOW + 60_000),
    score: 100,
    timeMs: 60000,
    result: null,
    finishKey: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  } as GameSession;
}

function createService() {
  const prisma = {
    team: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    round: { update: jest.fn() },
    gameSession: { findMany: jest.fn() },
  };
  const roundService = { getRound: jest.fn(), invalidateCache: jest.fn() };
  const sessions = { resetSession: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(1800) };
  const service = new AdminService(
    prisma as unknown as PrismaService,
    roundService as unknown as RoundService,
    sessions as unknown as SessionsService,
    config as unknown as ConfigService,
  );
  return { service, prisma, roundService, sessions, config };
}

describe("AdminService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("importRoster", () => {
    it("creates new teams with lowercased access codes", async () => {
      const { service, prisma } = createService();
      prisma.team.findMany.mockResolvedValue([]);

      const result = await service.importRoster({
        teams: [
          { code: "TEAM1", name: "Team One", memberNames: ["Alice"] },
          { code: "team2", name: "Team Two", memberNames: ["Bob", "Carol"], room: "A101" },
        ],
      });

      expect(result).toEqual({ created: 2, updated: 0, total: 2 });
      expect(prisma.team.create).toHaveBeenNthCalledWith(1, {
        data: {
          code: "TEAM1",
          accessCode: "team1",
          name: "Team One",
          memberNames: ["Alice"],
          room: null,
        },
      });
      expect(prisma.team.create).toHaveBeenNthCalledWith(2, {
        data: {
          code: "team2",
          accessCode: "team2",
          name: "Team Two",
          memberNames: ["Bob", "Carol"],
          room: "A101",
        },
      });
    });

    it("updates changed existing teams and keeps the rest", async () => {
      const { service, prisma } = createService();
      prisma.team.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        args.where.accessCode ? [] : [makeTeam({ name: "Old Name", memberNames: ["Alice"] })],
      );

      const result = await service.importRoster({
        teams: [
          { code: "TEAM1", name: "New Name", memberNames: ["Alice", "Bob"] },
          { code: "TEAM3", name: "Team Three", memberNames: ["Dan"] },
        ],
      });

      expect(result).toEqual({ created: 1, updated: 1, total: 2 });
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { code: "TEAM1" },
        data: { name: "New Name", memberNames: ["Alice", "Bob"], room: null },
      });
      expect(prisma.team.create).toHaveBeenCalledWith({
        data: {
          code: "TEAM3",
          accessCode: "team3",
          name: "Team Three",
          memberNames: ["Dan"],
          room: null,
        },
      });
    });

    it("does not update unchanged teams", async () => {
      const { service, prisma } = createService();
      prisma.team.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        args.where.accessCode ? [] : [makeTeam()],
      );

      const result = await service.importRoster({
        teams: [{ code: "TEAM1", name: "Team One", memberNames: ["Alice"] }],
      });

      expect(result).toEqual({ created: 0, updated: 1, total: 1 });
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it("rejects case-colliding codes in the same import", async () => {
      const { service } = createService();
      await expect(
        service.importRoster({
          teams: [
            { code: "TEAM1", name: "A", memberNames: ["A"] },
            { code: "team1", name: "B", memberNames: ["B"] },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects codes whose access code is taken by another team", async () => {
      const { service, prisma } = createService();
      prisma.team.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        args.where.accessCode
          ? [makeTeam({ code: "OTHER", accessCode: "newteam", name: "Other" })]
          : [],
      );

      await expect(
        service.importRoster({
          teams: [{ code: "NEWTEAM", name: "New", memberNames: ["A"] }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("round lifecycle", () => {
    it("starts an idle round with startedAt and expiresAt", async () => {
      const { service, prisma, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound());
      const updated = makeRound({
        status: "ACTIVE",
        startedAt: new Date(NOW),
        expiresAt: new Date(NOW + 1800_000),
      });
      prisma.round.update.mockResolvedValue(updated);

      const res = await service.startRound();

      expect(prisma.round.update).toHaveBeenCalledWith({
        where: { number: 1 },
        data: { status: "ACTIVE", startedAt: new Date(NOW), expiresAt: new Date(NOW + 1800_000), pausedAt: null },
      });
      expect(roundService.invalidateCache).toHaveBeenCalled();
      expect(res.status).toBe("ACTIVE");
      expect(res.startedAt).toBe(new Date(NOW).toISOString());
      expect(res.expiresAt).toBe(new Date(NOW + 1800_000).toISOString());
    });

    it("restarts an ended round (keeps config, refreshes timing)", async () => {
      const { service, prisma, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status: "ENDED" }));
      const updated = makeRound({
        status: "ACTIVE",
        startedAt: new Date(NOW),
        expiresAt: new Date(NOW + 1800_000),
      });
      prisma.round.update.mockResolvedValue(updated);

      const res = await service.startRound();

      expect(prisma.round.update).toHaveBeenCalledWith({
        where: { number: 1 },
        data: { status: "ACTIVE", startedAt: new Date(NOW), expiresAt: new Date(NOW + 1800_000), pausedAt: null },
      });
      expect(res.status).toBe("ACTIVE");
    });

    it.each(["ACTIVE", "PAUSED"] as const)(
      "rejects start from %s",
      async (status) => {
        const { service, roundService } = createService();
        roundService.getRound.mockResolvedValue(makeRound({ status }));
        await expect(service.startRound()).rejects.toThrow(ConflictException);
      },
    );

    it("pauses an active round", async () => {
      const { service, prisma, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status: "ACTIVE" }));
      prisma.round.update.mockResolvedValue(makeRound({ status: "PAUSED", pausedAt: new Date(NOW) }));

      const res = await service.pauseRound();

      expect(prisma.round.update).toHaveBeenCalledWith({
        where: { number: 1 },
        data: { status: "PAUSED", pausedAt: new Date(NOW) },
      });
      expect(res.status).toBe("PAUSED");
    });

    it("rejects pausing a non-active round", async () => {
      const { service, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status: "IDLE" }));
      await expect(service.pauseRound()).rejects.toThrow(ConflictException);
    });

    it("resumes a paused round and extends expiry by the pause duration", async () => {
      const { service, prisma, roundService } = createService();
      jest.setSystemTime(NOW + 120_000);
      roundService.getRound.mockResolvedValue(
        makeRound({
          status: "PAUSED",
          startedAt: new Date(NOW),
          expiresAt: new Date(NOW + 1800_000),
          pausedAt: new Date(NOW + 60_000),
        }),
      );
      const updated = makeRound({
        status: "ACTIVE",
        expiresAt: new Date(NOW + 1860_000),
        pausedAt: null,
      });
      prisma.round.update.mockResolvedValue(updated);

      const res = await service.resumeRound();

      expect(prisma.round.update).toHaveBeenCalledWith({
        where: { number: 1 },
        data: { status: "ACTIVE", pausedAt: null, expiresAt: new Date(NOW + 1860_000) },
      });
      expect(res.status).toBe("ACTIVE");
    });

    it("rejects resuming a non-paused round", async () => {
      const { service, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status: "ACTIVE" }));
      await expect(service.resumeRound()).rejects.toThrow(ConflictException);
    });

    it("ends an active round", async () => {
      const { service, prisma, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status: "ACTIVE" }));
      prisma.round.update.mockResolvedValue(makeRound({ status: "ENDED" }));

      const res = await service.endRound();

      expect(prisma.round.update).toHaveBeenCalledWith({
        where: { number: 1 },
        data: { status: "ENDED" },
      });
      expect(res.status).toBe("ENDED");
    });

    it.each(["IDLE", "ENDED"] as const)("rejects ending from %s", async (status) => {
      const { service, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status }));
      await expect(service.endRound()).rejects.toThrow(ConflictException);
    });
  });

  describe("updateConfig", () => {
    it("applies game config and invalidates the round cache", async () => {
      const { service, prisma, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status: "IDLE" }));
      prisma.round.update.mockResolvedValue(
        makeRound({ wordleAnswer: "spide", cardsSeed: 42 }),
      );

      const res = await service.updateConfig({
        wordleAnswer: "spide",
        cardsSeed: 42,
        shadowEnabled: false,
      });

      expect(prisma.round.update).toHaveBeenCalledWith({
        where: { number: 1 },
        data: {
          wordleAnswer: "spide",
          cardsSeed: 42,
          shadowEnabled: false,
        },
      });
      expect(roundService.invalidateCache).toHaveBeenCalled();
      expect(res.wordleAnswer).toBe("spide");
    });

    it("clears optional fields with null", async () => {
      const { service, prisma, roundService } = createService();
      roundService.getRound.mockResolvedValue(
        makeRound({ status: "IDLE", wordleAnswer: "spide", cardsSeed: 7 }),
      );
      prisma.round.update.mockResolvedValue(makeRound());

      await service.updateConfig({ wordleAnswer: null, cardsSeed: null });

      expect(prisma.round.update).toHaveBeenCalledWith({
        where: { number: 1 },
        data: { wordleAnswer: null, cardsSeed: null },
      });
    });

    it("rejects config while the round is active", async () => {
      const { service, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status: "ACTIVE" }));
      await expect(service.updateConfig({ wordleEnabled: false })).rejects.toThrow(
        ConflictException,
      );
    });

    it("rejects an empty config", async () => {
      const { service, roundService } = createService();
      roundService.getRound.mockResolvedValue(makeRound({ status: "IDLE" }));
      await expect(service.updateConfig({})).rejects.toThrow(BadRequestException);
    });
  });

  describe("listTeams", () => {
    it("maps teams with their sessions and total score", async () => {
      const { service, prisma } = createService();
      prisma.team.findMany.mockResolvedValue([
        {
          ...makeTeam(),
          sessions: [
            makeSession(),
            makeSession({ game: "CARDS", score: 250, status: "TIMEOUT", timeMs: 5000 }),
          ],
        },
      ]);

      const res = await service.listTeams();

      expect(res.total).toBe(1);
      expect(res.teams[0]).toMatchObject({
        code: "TEAM1",
        totalScore: 350,
        sessions: [
          { game: "WORDLE", status: "COMPLETED", score: 100 },
          { game: "CARDS", status: "TIMEOUT", score: 250 },
        ],
      });
    });
  });

  describe("resetTeam", () => {
    it("resets terminal sessions only", async () => {
      const { service, prisma, sessions } = createService();
      prisma.team.findUnique.mockResolvedValue(makeTeam());
      prisma.gameSession.findMany.mockResolvedValue([
        makeSession(),
        makeSession({ id: "sess-2", status: "ACTIVE" }),
        makeSession({ id: "sess-3", game: "SHADOW", status: "TIMEOUT" }),
      ]);
      sessions.resetSession.mockResolvedValue(undefined);

      const res = await service.resetTeam({ teamId: "team-1" });

      expect(res).toEqual({ reset: 2 });
      expect(sessions.resetSession).toHaveBeenCalledWith("sess-1");
      expect(sessions.resetSession).toHaveBeenCalledWith("sess-3");
      expect(sessions.resetSession).not.toHaveBeenCalledWith("sess-2");
    });

    it("filters by game when provided", async () => {
      const { service, prisma } = createService();
      prisma.team.findUnique.mockResolvedValue(makeTeam());
      prisma.gameSession.findMany.mockResolvedValue([]);

      await expect(
        service.resetTeam({ teamId: "team-1", game: "WORDLE" }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.gameSession.findMany).toHaveBeenCalledWith({
        where: { teamId: "team-1", game: "WORDLE" },
      });
    });

    it("404s for an unknown team", async () => {
      const { service, prisma } = createService();
      prisma.team.findUnique.mockResolvedValue(null);
      await expect(service.resetTeam({ teamId: "nope" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getRoundStatus", () => {
    it("maps the round to the public shape", async () => {
      const { service, roundService } = createService();
      roundService.getRound.mockResolvedValue(
        makeRound({
          status: "ACTIVE",
          startedAt: new Date(NOW),
          expiresAt: new Date(NOW + 600_000),
          wordleAnswer: "spide",
        }),
      );

      const res = await service.getRoundStatus();

      expect(res).toEqual({
        number: 1,
        status: "ACTIVE",
        startedAt: new Date(NOW).toISOString(),
        pausedAt: null,
        expiresAt: new Date(NOW + 600_000).toISOString(),
        wordleEnabled: true,
        shadowEnabled: true,
        cardsEnabled: true,
        wordleAnswer: "spide",
        cardsSeed: null,
      });
    });
  });
});
