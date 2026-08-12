import { BadRequestException, ConflictException } from "@nestjs/common";
import type { GameSession, Round } from "@spiderman/db";
import type { RedisService } from "../../common/redis/redis.service";
import type { RoundService } from "../../sessions/round.service";
import type { SessionsService } from "../../sessions/sessions.service";
import type { WordleState } from "./wordle.domain";
import { WordleService } from "./wordle.service";

const NOW = 1_700_000_000_000;

function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: "sess-1",
    teamId: "team-1",
    game: "WORDLE",
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

function makeState(overrides: Partial<WordleState> = {}): WordleState {
  return {
    word: "apple",
    guesses: [],
    status: "IN_PROGRESS",
    startedAt: NOW,
    wordLength: 5,
    attemptsAllowed: 6,
    ...overrides,
  };
}

function createService() {
  const sessions = {
    getActiveByTeam: jest.fn(),
    findByTeam: jest.fn(),
    getCached: jest.fn().mockResolvedValue(null),
    withLock: jest.fn(
      async (_sessionId: string, fn: () => Promise<unknown>) => fn(),
    ),
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
  const service = new WordleService(
    sessions as unknown as SessionsService,
    roundService as unknown as RoundService,
    redis as unknown as RedisService,
  );
  return { service, sessions, roundService, redis };
}

describe("WordleService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("start", () => {
    it("uses the admin-set round answer", async () => {
      const { service, sessions, roundService } = createService();
      roundService.assertCanStart.mockResolvedValue(makeRound({ wordleAnswer: "CRANE" }));
      sessions.createSession.mockResolvedValue({
        sessionId: "sess-1",
        expiresAt: new Date(NOW + 300_000),
        startedAt: new Date(NOW),
      });

      const res = await service.start("team-1");

      expect(res.sessionId).toBe("sess-1");
      expect(res.attemptsAllowed).toBe(6);
      expect(sessions.createSession).toHaveBeenCalledWith(
        "team-1",
        "WORDLE",
        expect.objectContaining({ word: "crane", guesses: [], status: "IN_PROGRESS" }),
      );
    });

    it("picks a random answer and caches it per round", async () => {
      const { service, sessions, roundService, redis } = createService();
      roundService.assertCanStart.mockResolvedValue(makeRound());
      redis.getJson.mockResolvedValue(null);
      sessions.createSession.mockResolvedValue({
        sessionId: "sess-1",
        expiresAt: new Date(NOW + 300_000),
        startedAt: new Date(NOW),
      });

      await service.start("team-1");

      const initialState = sessions.createSession.mock.calls[0][2] as WordleState;
      expect(initialState.word).toHaveLength(5);
      expect(redis.setJson).toHaveBeenCalledWith(
        "wordle:answer:round:round-1",
        initialState.word,
        expect.any(Number),
      );
    });

    it("reuses a cached round answer so all teams see the same word", async () => {
      const { service, sessions, roundService, redis } = createService();
      roundService.assertCanStart.mockResolvedValue(makeRound());
      redis.getJson.mockResolvedValue("apple");
      sessions.createSession.mockResolvedValue({
        sessionId: "sess-1",
        expiresAt: new Date(NOW + 300_000),
        startedAt: new Date(NOW),
      });

      await service.start("team-1");

      expect(redis.setJson).not.toHaveBeenCalled();
      const initialState = sessions.createSession.mock.calls[0][2] as WordleState;
      expect(initialState.word).toBe("apple");
    });

    it("rejects start when the round is not open", async () => {
      const { service, roundService } = createService();
      roundService.assertCanStart.mockRejectedValue(
        new ConflictException("The round is not open yet"),
      );
      await expect(service.start("team-1")).rejects.toThrow(ConflictException);
    });
  });

  describe("guess", () => {
    it("processes an in-progress guess and persists state", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(makeState());

      const res = await service.guess("team-1", "crane", "action-12345");

      expect(res).toEqual({
        guessCount: 1,
        attemptsLeft: 5,
        feedback: expect.any(Array),
        wordleStatus: "IN_PROGRESS",
      });
      expect(sessions.writeState).toHaveBeenCalledWith(
        "sess-1",
        expect.objectContaining({ guesses: ["crane"] }),
        expect.any(Number),
      );
      expect(sessions.completeSession).not.toHaveBeenCalled();
      expect(sessions.recordAction).toHaveBeenCalledWith(
        "sess-1",
        "action-12345",
        "guess",
        { guess: "crane" },
        res,
      );
    });

    it("finalizes with a WON score on a correct guess", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(makeState());
      sessions.completeSession.mockImplementation(async (_id: string, input: unknown) => ({
        ...makeSession(),
        status: input.status,
        score: input.score,
        timeMs: input.timeMs,
      }));

      const res = await service.guess("team-1", "apple", "action-12345");

      expect(res.wordleStatus).toBe("WON");
      expect(sessions.completeSession).toHaveBeenCalledWith(
        "sess-1",
        expect.objectContaining({ status: "COMPLETED", score: 1000, finishKey: "action-12345" }),
      );
    });

    it("finalizes as LOST with zero score after the last attempt", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(
        makeState({
          guesses: ["crane", "crane", "crane", "crane", "crane"],
        }),
      );
      sessions.completeSession.mockImplementation(async (_id: string, input: unknown) => ({
        ...makeSession(),
        status: input.status,
        score: input.score,
        timeMs: input.timeMs,
      }));

      const res = await service.guess("team-1", "crane", "action-12345");

      expect(res.wordleStatus).toBe("LOST");
      expect(res.attemptsLeft).toBe(0);
      expect(sessions.completeSession).toHaveBeenCalledWith(
        "sess-1",
        expect.objectContaining({ status: "COMPLETED", score: 0 }),
      );
    });

    it("returns a replay-safe cached response for duplicate clientActionId", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      const cached = {
        guessCount: 1,
        attemptsLeft: 5,
        feedback: [],
        wordleStatus: "IN_PROGRESS",
      };
      sessions.getCached.mockResolvedValue(cached);

      const res = await service.guess("team-1", "crane", "dup-action-id");

      expect(res).toBe(cached);
      expect(sessions.withLock).not.toHaveBeenCalled();
    });

    it("rejects a guess that is not a real word", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());

      await expect(service.guess("team-1", "zzzzz", "action-12345")).rejects.toThrow(
        BadRequestException,
      );
      expect(sessions.withLock).not.toHaveBeenCalled();
    });

    it("rejects a guess with the wrong word length", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(makeState({ wordLength: 4 }));

      await expect(service.guess("team-1", "apple", "action-12345")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("finalizes as TIMEOUT with zero score when expired", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.isExpired.mockReturnValue(true);
      sessions.readState.mockResolvedValue(makeState({ guesses: ["crane"] }));

      const res = await service.guess("team-1", "crane", "action-12345");

      expect(res.wordleStatus).toBe("TIMEOUT");
      expect(res.guessCount).toBe(1);
      expect(sessions.completeSession).toHaveBeenCalledWith(
        "sess-1",
        expect.objectContaining({
          status: "TIMEOUT",
          score: 0,
          finishKey: "wordle-timeout:sess-1",
        }),
      );
    });

    it("rejects a guess on a session with no state", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(null);

      await expect(service.guess("team-1", "crane", "action-12345")).rejects.toThrow(
        ConflictException,
      );
    });

    it("throws a conflict when the session lock is busy", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.withLock.mockResolvedValue(null);

      await expect(service.guess("team-1", "crane", "action-12345")).rejects.toThrow(
        ConflictException,
      );
    });

    it("rejects guesses once the game has been completed", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(
        makeSession({ status: "COMPLETED", score: 500, timeMs: 42_000 }),
      );

      await expect(service.guess("team-1", "crane", "action-12345")).rejects.toThrow(
        ConflictException,
      );
      expect(sessions.withLock).not.toHaveBeenCalled();
    });

    it("returns the cached response when replaying a completed guess", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(
        makeSession({ status: "COMPLETED", score: 1000, timeMs: 42_000 }),
      );
      const cached = {
        guessCount: 1,
        attemptsLeft: 5,
        feedback: [],
        wordleStatus: "WON",
      };
      sessions.getCached.mockResolvedValue(cached);

      const res = await service.guess("team-1", "crane", "dup-action-id");

      expect(res).toBe(cached);
      expect(sessions.withLock).not.toHaveBeenCalled();
    });
  });

  describe("finish", () => {
    it("finalizes a timed-out session and returns the result", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.isExpired.mockReturnValue(true);
      sessions.completeSession.mockImplementation(async (_id: string, input: unknown) => ({
        ...makeSession(),
        status: input.status,
        score: input.score,
        timeMs: input.timeMs,
      }));

      const res = await service.finish("team-1", "finish-12345");

      expect(res).toEqual({ score: 0, timeMs: expect.any(Number) });
      expect(sessions.completeSession).toHaveBeenCalledWith(
        "sess-1",
        expect.objectContaining({ status: "TIMEOUT", score: 0 }),
      );
    });

    it("rejects finish while the game is still in progress", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.isExpired.mockReturnValue(false);

      await expect(service.finish("team-1", "finish-12345")).rejects.toThrow(
        ConflictException,
      );
      expect(sessions.completeSession).not.toHaveBeenCalled();
    });

    it("returns the stored result for an already-completed session", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(
        makeSession({ status: "COMPLETED", score: 500, timeMs: 42_000 }),
      );

      const res = await service.finish("team-1", "finish-12345");

      expect(res).toEqual({ score: 500, timeMs: 42_000 });
      expect(sessions.withLock).not.toHaveBeenCalled();
    });

    it("rejects finish for an abandoned session", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession({ status: "ABANDONED" }));

      await expect(service.finish("team-1", "finish-12345")).rejects.toThrow(
        ConflictException,
      );
    });

    it("returns a cached response for a duplicate finish request", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.getCached.mockResolvedValue({ score: 0, timeMs: 12_000 });

      const res = await service.finish("team-1", "dup-finish-id");

      expect(res).toEqual({ score: 0, timeMs: 12_000 });
      expect(sessions.withLock).not.toHaveBeenCalled();
    });
  });
});
