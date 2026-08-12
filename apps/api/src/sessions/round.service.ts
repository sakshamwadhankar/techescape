import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { Game, Round } from "@spiderman/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import { ROUND_CACHE_TTL_SECONDS } from "../common/constants";

const ROUND_CACHE_KEY = "round:current";

const GAME_ENABLED_COLUMN: Record<Game, "wordleEnabled" | "shadowEnabled" | "cardsEnabled"> = {
  WORDLE: "wordleEnabled",
  SHADOW: "shadowEnabled",
  CARDS: "cardsEnabled",
};

@Injectable()
export class RoundService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async getRound(): Promise<Round> {
    const cached = await this.redis.getJson<Round>(ROUND_CACHE_KEY);
    if (cached) return this.normalize(cached);

    const round = await this.prisma.round.findUnique({ where: { number: 1 } });
    if (!round) {
      throw new InternalServerErrorException("Round is not configured");
    }
    await this.redis.setJson(ROUND_CACHE_KEY, round, ROUND_CACHE_TTL_SECONDS);
    return round;
  }

  /** Verify the round is open and the requested game is enabled. */
  async assertCanStart(game: Game): Promise<Round> {
    const round = await this.getRound();
    if (round.status !== "ACTIVE") {
      throw new ConflictException(
        round.status === "PAUSED" ? "The round is paused" : "The round is not open yet",
      );
    }
    if (!round[GAME_ENABLED_COLUMN[game]]) {
      throw new ConflictException("This game is disabled");
    }
    return round;
  }

  isOpen(round: Round): boolean {
    return round.status === "ACTIVE";
  }

  /** Drop the cached round so the next read hits Postgres. */
  async invalidateCache(): Promise<void> {
    await this.redis.del(ROUND_CACHE_KEY);
  }

  /** Restore Date fields (JSON round-trip through Redis stores them as strings). */
  private normalize(round: Round): Round {
    return {
      ...round,
      startedAt: round.startedAt ? new Date(round.startedAt) : null,
      pausedAt: round.pausedAt ? new Date(round.pausedAt) : null,
      expiresAt: round.expiresAt ? new Date(round.expiresAt) : null,
      createdAt: new Date(round.createdAt),
      updatedAt: new Date(round.updatedAt),
    };
  }
}
