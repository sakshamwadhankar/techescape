import type { GameKind, PlayerStatusResponse } from "@spiderman/types";
import { prisma } from "../db";
import { getRound } from "./round.service";

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

export async function playerStatus(teamId: string): Promise<PlayerStatusResponse> {
  const [team, sessions, round] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamId } }),
    prisma.gameSession.findMany({ where: { teamId } }),
    getRound(),
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
