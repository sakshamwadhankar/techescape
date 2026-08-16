import type { Game, Round } from "@spiderman/db";
import { prisma } from "../db";
import { del, getJson, setJson } from "../redis";
import { ROUND_CACHE_TTL_SECONDS } from "../constants";

const ROUND_CACHE_KEY = "round:current";

const GAME_ENABLED_COLUMN: Record<Game, "wordleEnabled" | "shadowEnabled" | "cardsEnabled"> = {
  WORDLE: "wordleEnabled",
  SHADOW: "shadowEnabled",
  CARDS: "cardsEnabled",
};

export async function getRound(): Promise<Round> {
  const cached = await getJson<Round>(ROUND_CACHE_KEY);
  if (cached) return normalize(cached);

  const round = await prisma.round.findUnique({ where: { number: 1 } });
  if (!round) {
    throw new Error("Round is not configured");
  }
  await setJson(ROUND_CACHE_KEY, round, ROUND_CACHE_TTL_SECONDS);
  return round;
}

export async function assertCanStart(game: Game): Promise<Round> {
  const round = await getRound();
  if (round.status !== "ACTIVE") {
    throw new Error(
      round.status === "PAUSED" ? "The round is paused" : "The round is not open yet",
    );
  }
  if (!round[GAME_ENABLED_COLUMN[game]]) {
    throw new Error("This game is disabled");
  }
  return round;
}

export function isOpen(round: Round): boolean {
  return round.status === "ACTIVE";
}

export async function invalidateRoundCache(): Promise<void> {
  await del(ROUND_CACHE_KEY);
}

function normalize(round: Round): Round {
  return {
    ...round,
    startedAt: round.startedAt ? new Date(round.startedAt) : null,
    pausedAt: round.pausedAt ? new Date(round.pausedAt) : null,
    expiresAt: round.expiresAt ? new Date(round.expiresAt) : null,
    createdAt: new Date(round.createdAt),
    updatedAt: new Date(round.updatedAt),
  };
}
