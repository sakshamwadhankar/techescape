import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { Game, Round } from "@spiderman/db";
import { PrismaService } from "../common/prisma/prisma.service";

const GAME_ENABLED_COLUMN: Record<Game, "wordleEnabled" | "shadowEnabled" | "cardsEnabled"> = {
  WORDLE: "wordleEnabled",
  SHADOW: "shadowEnabled",
  CARDS: "cardsEnabled",
};

@Injectable()
export class RoundService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getRound(): Promise<Round> {
    const round = await this.prisma.round.findUnique({ where: { number: 1 } });
    if (!round) {
      throw new InternalServerErrorException("Round is not configured");
    }
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
}
