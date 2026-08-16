import { Prisma } from "@spiderman/db";
import type {
  LeaderboardEntry,
  LeaderboardMeResponse,
  LeaderboardResponse,
} from "@spiderman/types";
import { prisma } from "../db";
import { getJson, setJson } from "../redis";
import { getRound } from "./round.service";
import { ROUND_CACHE_TTL_SECONDS } from "../constants";

interface LeaderboardRow {
  teamCode: string;
  teamName: string;
  totalScore: number;
  totalTimeMs: number;
  gamesCompleted: number;
}

export async function getTopLeaderboard(limit: number): Promise<LeaderboardResponse> {
  const round = await getRound();
  const key = `leaderboard:round:${round.id}`;

  const cached = await getJson<LeaderboardResponse>(key);
  if (cached) return cached;

  const [rows, totalTeams] = await Promise.all([
    computeRows(limit),
    prisma.team.count(),
  ]);
  const response: LeaderboardResponse = { entries: rows, totalTeams };
  await setJson(key, response, ROUND_CACHE_TTL_SECONDS);
  return response;
}

export async function getMyLeaderboardRank(teamId: string): Promise<LeaderboardMeResponse> {
  const [team, rows] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { code: true } }),
    computeRows(100_000),
  ]);
  const entry = rows.find((e) => e.teamCode === team?.code);
  if (!entry) return { rank: null, entry: null };
  return { rank: entry.rank, entry };
}

async function computeRows(limit: number): Promise<LeaderboardEntry[]> {
  const rows = await prisma.$queryRaw<LeaderboardRow[]>(Prisma.sql`
    SELECT
      t.code   AS "teamCode",
      t.name   AS "teamName",
      COALESCE(SUM(s.score), 0)::int   AS "totalScore",
      COALESCE(SUM(s."timeMs"), 0)::int AS "totalTimeMs",
      COUNT(s.id)::int                 AS "gamesCompleted"
    FROM "Team" t
    JOIN "GameSession" s ON s."teamId" = t.id
    WHERE s.status IN ('COMPLETED', 'TIMEOUT')
    GROUP BY t.id
    ORDER BY "totalScore" DESC, "totalTimeMs" ASC, "teamName" ASC
    LIMIT ${limit}
  `);

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
