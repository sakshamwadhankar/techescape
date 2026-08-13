import { BadRequestException, ConflictException } from "@nestjs/common";
import type { GameSession, Round } from "@spiderman/db";
import type { ConfigService } from "@nestjs/config";
import type { RedisService } from "../../common/redis/redis.service";
import type { RoundService } from "../../sessions/round.service";
import type { SessionsService } from "../../sessions/sessions.service";
import { buildDeck, type CardsState } from "./cards.domain";
import { CardsService } from "./cards.service";
import { CARDS_DECK_SLUGS } from "../../common/constants";

const NOW = 1_700_000_000_000;
const BASE = "http://localhost:3000";
const SLUGS = ["venom", "spiderman"] as const;

function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: "sess-1",
    teamId: "team-1",
    game: "CARDS",
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

function makeDeckCards(): CardsState["deck"] {
  return buildDeck(1, SLUGS, BASE).cards;
}

function makeState(overrides: Partial<CardsState> = {}): CardsState {
  return {
    deck: makeDeckCards(),
    matched: [],
    revealed: [],
    moves: 0,
    matchedPairs: 0,
    totalPairs: SLUGS.length,
    startedAt: NOW,
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
  const config = { get: jest.fn().mockReturnValue(BASE) };
  const service = new CardsService(
    sessions as unknown as SessionsService,
    roundService as unknown as RoundService,
    redis as unknown as RedisService,
    config as unknown as ConfigService,
  );
  return { service, sessions, roundService, redis, config };
}

function pairIndexes(deck: CardsState["deck"], pairId: string): number[] {
  return deck
    .map((c, i) => ({ pairId: c.pairId, index: i }))
    .filter((c) => c.pairId === pairId)
    .map((c) => c.index);
}

describe("CardsService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("start", () => {
    it("returns the deck, back asset, and seeds session state", async () => {
      const { service, sessions, roundService, redis } = createService();
      roundService.assertCanStart.mockResolvedValue(makeRound());
      redis.getJson.mockResolvedValue(null);
      sessions.createSession.mockResolvedValue({
        sessionId: "sess-1",
        expiresAt: new Date(NOW + 300_000),
        startedAt: new Date(NOW),
      });

      const res = await service.start("team-1");

      expect(res.sessionId).toBe("sess-1");
      expect(res.cards).toHaveLength(CARDS_DECK_SLUGS.length * 2);
      expect(res.cards[0]).toEqual({ id: expect.any(String), index: 0 });
      expect(res.backAssetUrl).toContain("/assets/cards/back.svg");
      expect(redis.setJson).toHaveBeenCalledWith(
        "cards:deck:round:round-1",
        expect.anything(),
        expect.any(Number),
      );
      const state = sessions.createSession.mock.calls[0][2] as CardsState;
      expect(state.deck).toHaveLength(CARDS_DECK_SLUGS.length * 2);
      expect(state.matchedPairs).toBe(0);
    });

    it("reuses a cached round deck", async () => {
      const { service, sessions, roundService, redis } = createService();
      roundService.assertCanStart.mockResolvedValue(makeRound());
      redis.getJson.mockResolvedValue(buildDeck(7, SLUGS, BASE));
      sessions.createSession.mockResolvedValue({
        sessionId: "sess-1",
        expiresAt: new Date(NOW + 300_000),
        startedAt: new Date(NOW),
      });

      await service.start("team-1");

      expect(redis.setJson).not.toHaveBeenCalled();
      const state = sessions.createSession.mock.calls[0][2] as CardsState;
      expect(state.deck).toHaveLength(4);
    });

    it("rejects start when the round is not open", async () => {
      const { service, roundService } = createService();
      roundService.assertCanStart.mockRejectedValue(
        new ConflictException("The round is not open yet"),
      );
      await expect(service.start("team-1")).rejects.toThrow(ConflictException);
    });
  });

  describe("move", () => {
    it("reveals a single card and persists state", async () => {
      const { service, sessions } = createService();
      const state = makeState();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(state);

      const res = await service.move("team-1", state.deck[0]!.id, "move-000001");

      expect(res.moveId).toBe("move-000001");
      expect(res.revealed).toBe(true);
      expect(res.matched).toBe(false);
      expect(res.matchCompleted).toBe(false);
      expect(res.unmatchedFlipBack).toBe(false);
      expect(res.state.revealed).toEqual([0]);
      expect(res.state.status).toBe("IN_PROGRESS");
      expect(sessions.completeSession).not.toHaveBeenCalled();
      expect(sessions.recordAction).toHaveBeenCalledWith(
        "sess-1",
        "move-000001",
        "move",
        { cardId: state.deck[0]!.id },
        res,
      );
    });

    it("flips both cards back on a mismatch", async () => {
      const { service, sessions } = createService();
      const state = makeState();
      let current = state;
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockImplementation(async () => current);
      const [venomA] = pairIndexes(state.deck, "venom");
      const [spideyA] = pairIndexes(state.deck, "spiderman");

      const first = await service.move("team-1", state.deck[venomA]!.id, "move-000001");
      expect(first.revealed).toBe(true);
      current = { ...state, revealed: [venomA], moves: 1 };
      const second = await service.move("team-1", state.deck[spideyA]!.id, "move-000002");
      expect(second.revealed).toBe(false);
      expect(second.matched).toBe(false);
      expect(second.matchCompleted).toBe(false);
      expect(second.unmatchedFlipBack).toBe(true);
      expect(second.state.revealed).toEqual([]);
      expect(second.state.moves).toBe(2);
    });

    it("completes a pair on a matching second flip", async () => {
      const { service, sessions } = createService();
      const state = makeState();
      let current = state;
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockImplementation(async () => current);
      const [a, b] = pairIndexes(state.deck, "venom");

      const first = await service.move("team-1", state.deck[a]!.id, "move-000001");
      expect(first.revealed).toBe(true);
      current = { ...state, revealed: [a], moves: 1 };
      const second = await service.move("team-1", state.deck[b]!.id, "move-000002");
      expect(second.matched).toBe(true);
      expect(second.matchCompleted).toBe(true);
      expect(second.state.matched).toHaveLength(2);
      expect(second.state.matchedPairs).toBe(1);
      expect(second.state.revealed).toEqual([]);
      expect(sessions.completeSession).not.toHaveBeenCalled();
    });

    it("finalizes COMPLETED with the earned score on the last pair", async () => {
      const { service, sessions } = createService();
      const state = makeState({ matchedPairs: 1, matched: ["pre-1", "pre-2"] });
      let current = state;
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockImplementation(async () => current);
      sessions.completeSession.mockImplementation(
        async (_id: string, input: unknown) => ({
          ...makeSession(),
          status: input.status,
          score: input.score,
          timeMs: input.timeMs,
        }),
      );
      const [a, b] = pairIndexes(state.deck, "spiderman");

      const first = await service.move("team-1", state.deck[a]!.id, "move-000001");
      expect(first.revealed).toBe(true);
      current = { ...state, revealed: [a], moves: 1 };
      const res = await service.move("team-1", state.deck[b]!.id, "move-000002");

      expect(res.state.status).toBe("COMPLETED");
      expect(res.state.matchedPairs).toBe(2);
      expect(sessions.completeSession).toHaveBeenCalledWith(
        "sess-1",
        expect.objectContaining({
          status: "COMPLETED",
          score: 200,
          result: expect.objectContaining({ matchedPairs: 2, totalPairs: 2 }),
        }),
      );
    });

    it("returns the cached response for a duplicate submission", async () => {
      const { service, sessions } = createService();
      const state = makeState();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.getCached.mockResolvedValue({ moveId: "move-000001", state: { moves: 1 } });

      const res = await service.move("team-1", state.deck[0]!.id, "move-000001");

      expect(sessions.readState).not.toHaveBeenCalled();
      expect(res.moveId).toBe("move-000001");
    });

    it("rejects an unknown card with 400", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(makeState());

      await expect(
        service.move("team-1", "11111111-1111-4111-8111-111111111111", "move-000001"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a card that is already matched with 409", async () => {
      const { service, sessions } = createService();
      const state = makeState({ matched: [makeDeckCards()[0]!.id] });
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(state);

      await expect(
        service.move("team-1", state.deck[0]!.id, "move-000001"),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects a card that is already revealed with 409", async () => {
      const { service, sessions } = createService();
      const state = makeState({ revealed: [0] });
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.readState.mockResolvedValue(state);

      await expect(
        service.move("team-1", state.deck[0]!.id, "move-000001"),
      ).rejects.toThrow(ConflictException);
    });

    it("finalizes TIMEOUT with the earned score when expired", async () => {
      const { service, sessions } = createService();
      const state = makeState({ matchedPairs: 2, moves: 5, matched: ["m1", "m2", "m3", "m4"] });
      sessions.findByTeam.mockResolvedValue(makeSession({ status: "ACTIVE" }));
      sessions.isExpired.mockReturnValue(true);
      sessions.readState.mockResolvedValue(state);

      const res = await service.move("team-1", state.deck[0]!.id, "move-000001");

      expect(res.state.status).toBe("TIMEOUT");
      expect(sessions.completeSession).toHaveBeenCalledWith(
        "sess-1",
        expect.objectContaining({ status: "TIMEOUT", score: 190 }),
      );
    });

    it("rejects moves on a completed session with 409", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession({ status: "COMPLETED" }));

      await expect(
        service.move("team-1", "any-id", "move-000001"),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("finish", () => {
    it("returns the stored result for a terminal session", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(
        makeSession({ status: "COMPLETED", score: 400, timeMs: 99_000 }),
      );

      const res = await service.finish("team-1", "finish-0001");

      expect(res).toEqual({ score: 400, timeMs: 99_000 });
    });

    it("finalizes an expired active session as TIMEOUT", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());
      sessions.isExpired.mockReturnValue(true);
      sessions.readState.mockResolvedValue(makeState({ matchedPairs: 1, moves: 3 }));
      sessions.completeSession.mockImplementation(
        async (_id: string, input: unknown) => ({
          ...makeSession(),
          status: input.status,
          score: input.score,
          timeMs: input.timeMs,
        }),
      );

      const res = await service.finish("team-1", "finish-0001");

      expect(sessions.completeSession).toHaveBeenCalledWith(
        "sess-1",
        expect.objectContaining({ status: "TIMEOUT", score: 90 }),
      );
      expect(res).toEqual({ score: 90, timeMs: expect.any(Number) });
    });

    it("rejects finish while the game is still in progress", async () => {
      const { service, sessions } = createService();
      sessions.findByTeam.mockResolvedValue(makeSession());

      await expect(service.finish("team-1", "finish-0001")).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
