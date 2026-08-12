import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Round } from "@spiderman/db";
import type {
  CardsMoveResponse,
  CardsResult,
  CardsStartResponse,
  GameFinishResponse,
} from "@spiderman/types";
import {
  CARDS_DECK_SLUGS,
  CARDS_PAIR_COUNT,
  SESSION_STATE_TTL_BUFFER_SECONDS,
} from "../../common/constants";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../common/redis/redis.service";
import { RoundService } from "../../sessions/round.service";
import { SessionsService } from "../../sessions/sessions.service";
import {
  buildDeck,
  cardScore,
  flipCard,
  isAllMatched,
  toPublicState,
  type CardsDeck,
  type CardsState,
} from "./cards.domain";

const DECK_CACHE_TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_FINISH_KEY_PREFIX = "cards-timeout";

@Injectable()
export class CardsService {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(RoundService) private readonly roundService: RoundService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async start(teamId: string): Promise<CardsStartResponse> {
    const round = await this.roundService.assertCanStart("CARDS");
    const deck = await this.resolveDeck(round);
    const initialState: CardsState = {
      deck: deck.cards,
      matched: [],
      revealed: [],
      moves: 0,
      matchedPairs: 0,
      totalPairs: CARDS_PAIR_COUNT,
      startedAt: Date.now(),
    };
    const session = await this.sessions.createSession(teamId, "CARDS", initialState);
    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt.toISOString(),
      cards: deck.cards.map((card) => ({ id: card.id, index: card.index })),
      backAssetUrl: deck.backAssetUrl,
    };
  }

  async move(
    teamId: string,
    cardId: string,
    clientActionId: string,
  ): Promise<CardsMoveResponse> {
    const session = await this.sessions.findByTeam(teamId, "CARDS");
    const sessionId = session.id;

    const cached = await this.sessions.getCached(sessionId, clientActionId);
    if (cached) return cached as CardsMoveResponse;

    if (session.status !== "ACTIVE") {
      throw new ConflictException(
        session.status === "COMPLETED" || session.status === "TIMEOUT"
          ? "Game already completed"
          : "Session is not active",
      );
    }

    const result = await this.sessions.withLock(sessionId, async () => {
      if (this.sessions.isExpired(session)) {
        const state = await this.sessions.readState<CardsState>(sessionId);
        const score = cardScore(state?.matchedPairs ?? 0, state?.moves ?? 0);
        const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
        const gameResult: CardsResult = {
          moves: state?.moves ?? 0,
          matchedPairs: state?.matchedPairs ?? 0,
          totalPairs: state?.totalPairs ?? CARDS_PAIR_COUNT,
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
        return this.timeoutMoveResponse(clientActionId, cardId, state);
      }

      const state = await this.sessions.readState<CardsState>(sessionId);
      if (!state) throw new ConflictException("Game already completed");

      const index = state.deck.findIndex((card) => card.id === cardId);
      if (index === -1) throw new BadRequestException("Unknown card");
      if (state.matched.includes(cardId)) {
        throw new ConflictException("Card already matched");
      }
      if (state.revealed.includes(index)) {
        throw new ConflictException("Card already revealed");
      }

      const card = state.deck[index]!;
      const outcome = flipCard(state, index);
      const completed = isAllMatched(outcome.next);
      const response: CardsMoveResponse = {
        moveId: clientActionId,
        cardId,
        frontAssetUrl: card.frontAssetUrl,
        revealed: outcome.revealed,
        matched: outcome.matched,
        matchCompleted: outcome.matchCompleted,
        unmatchedFlipBack: outcome.unmatchedFlipBack,
        state: toPublicState(outcome.next),
      };

      if (!completed) {
        await this.sessions.writeState(sessionId, outcome.next, this.sessions.remainingTtl(session));
      } else {
        const timeMs = Date.now() - state.startedAt;
        const score = cardScore(outcome.next.matchedPairs, outcome.next.moves);
        const gameResult: CardsResult = {
          moves: outcome.next.moves,
          matchedPairs: outcome.next.matchedPairs,
          totalPairs: outcome.next.totalPairs,
          score,
          timeMs,
        };
        await this.sessions.completeSession(sessionId, {
          status: "COMPLETED",
          score,
          timeMs,
          result: gameResult,
          finishKey: clientActionId,
        });
      }

      await this.sessions.recordAction(sessionId, clientActionId, "move", { cardId }, response);
      await this.sessions.cacheAction(sessionId, clientActionId, response);
      return response;
    });

    if (result === null) {
      throw new ConflictException("Session is busy, please retry");
    }
    return result;
  }

  async finish(teamId: string, clientActionId: string): Promise<GameFinishResponse> {
    const session = await this.sessions.findByTeam(teamId, "CARDS");
    const sessionId = session.id;

    const cached = await this.sessions.getCached(sessionId, clientActionId);
    if (cached) return cached as GameFinishResponse;

    if (session.status !== "ACTIVE") {
      if (session.status === "ABANDONED") {
        throw new ConflictException("Session is not active");
      }
      const stored = (session.result as CardsResult | null) ?? null;
      return { score: session.score, timeMs: session.timeMs ?? stored?.timeMs ?? 0 };
    }

    const result = await this.sessions.withLock(sessionId, async () => {
      if (!this.sessions.isExpired(session)) {
        throw new ConflictException("Game is still in progress");
      }
      const state = await this.sessions.readState<CardsState>(sessionId);
      const timeMs = Date.now() - (state?.startedAt ?? session.startedAt.getTime());
      const score = cardScore(state?.matchedPairs ?? 0, state?.moves ?? 0);
      const gameResult: CardsResult = {
        moves: state?.moves ?? 0,
        matchedPairs: state?.matchedPairs ?? 0,
        totalPairs: state?.totalPairs ?? CARDS_PAIR_COUNT,
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
   * The round's card layout, generated once from the seeded RNG and cached in
   * Redis so hundreds of concurrent starts do not hit Postgres. The seed comes
   * from `Round.cardsSeed` or a one-time random pick cached per round.
   */
  private async resolveDeck(round: Round): Promise<CardsDeck> {
    const deckKey = `cards:deck:round:${round.id}`;
    const cached = await this.redis.getJson<CardsDeck>(deckKey);
    if (cached) return cached;

    const seed = await this.resolveSeed(round);
    const base = (this.config.get<string>("ASSET_CDN_URL") || this.config.get<string>("WEB_ORIGIN") || "").replace(/\/+$/, "");
    const deck = buildDeck(seed, CARDS_DECK_SLUGS, base);

    const ttl = round.expiresAt
      ? Math.max(
          60,
          Math.ceil((new Date(round.expiresAt).getTime() - Date.now()) / 1000) +
            SESSION_STATE_TTL_BUFFER_SECONDS,
        )
      : DECK_CACHE_TTL_SECONDS;
    await this.redis.setJson(deckKey, deck, ttl);
    return deck;
  }

  private async resolveSeed(round: Round): Promise<number> {
    if (round.cardsSeed !== null) return round.cardsSeed;
    const seedKey = `cards:seed:round:${round.id}`;
    const cached = await this.redis.getJson<number>(seedKey);
    if (cached !== null) return cached;
    const seed = Math.floor(Math.random() * 2 ** 31);
    await this.redis.setJson(seedKey, seed, DECK_CACHE_TTL_SECONDS);
    return seed;
  }

  private timeoutMoveResponse(
    clientActionId: string,
    cardId: string,
    state: CardsState | null,
  ): CardsMoveResponse {
    return {
      moveId: clientActionId,
      cardId,
      frontAssetUrl: "",
      revealed: false,
      matched: false,
      matchCompleted: false,
      unmatchedFlipBack: false,
      state: {
        moves: state?.moves ?? 0,
        revealed: [],
        matched: state?.matched ?? [],
        matchedPairs: state?.matchedPairs ?? 0,
        totalPairs: state?.totalPairs ?? CARDS_PAIR_COUNT,
        status: "TIMEOUT",
      },
    };
  }
}
