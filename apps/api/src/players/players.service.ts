import { Inject, Injectable } from "@nestjs/common";
import type { GameKind, PlayerStatusResponse } from "@spiderman/types";
import { PrismaService } from "../common/prisma/prisma.service";
import { RoundService } from "../sessions/round.service";

function emptySummary(game: GameKind): PlayerStatusResponse["sessions"][GameKind] {
  return {
    game,
    status: "ACTIVE",
    startedAt: null,
    expiresAt: null,
    finishedAt: null,
    score: null,
  };
}

@Injectable()
export class PlayersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RoundService) private readonly round: RoundService,
  ) {}

  async status(teamId: string): Promise<PlayerStatusResponse> {
    const [team, sessions, round] = await Promise.all([
      this.prisma.team.findUniqueOrThrow({ where: { id: teamId } }),
      this.prisma.gameSession.findMany({ where: { teamId } }),
      this.round.getRound(),
    ]);

    const sessionsByGame = {
      WORDLE: emptySummary("WORDLE"),
      SHADOW: emptySummary("SHADOW"),
      CARDS: emptySummary("CARDS"),
    };
    for (const s of sessions) {
      sessionsByGame[s.game] = {
        game: s.game,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        finishedAt: s.finishedAt ? s.finishedAt.toISOString() : null,
        score: s.score,
      };
    }

    return {
      team: {
        id: team.id,
        code: team.code,
        name: team.name,
        memberNames: team.memberNames,
        room: team.room,
      },
      sessions: sessionsByGame,
      roundOpen: round.status === "ACTIVE",
    };
  }
}
