import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@spiderman/db";
import type {
  LeaderboardEntry,
  LeaderboardMeResponse,
  LeaderboardResponse,
} from "@spiderman/types";
import { PrismaService } from "../common/prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import { RoundService } from "../sessions/round.service";
import { ROUND_CACHE_TTL_SECONDS } from "../common/constants";

interface LeaderboardRow {
  teamCode: string;
  teamName: string;
  totalScore: number;
  totalTimeMs: number;
  gamesCompleted: number;
}

@Injectable()
export class LeaderboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(RoundService) private readonly round: RoundService,
  ) {}

  async top(limit: number): Promise<LeaderboardResponse> {
    const round = await this.round.getRound();
    const key = `leaderboard:round:${round.id}`;

    const cached = await this.redis.getJson<LeaderboardResponse>(key);
    if (cached) return cached;

    const [rows, totalTeams] = await Promise.all([
      this.computeRows(limit),
      this.prisma.team.count(),
    ]);
    const response: LeaderboardResponse = { entries: rows, totalTeams };
    await this.redis.setJson(key, response, ROUND_CACHE_TTL_SECONDS);
    return response;
  }

  async me(teamId: string): Promise<LeaderboardMeResponse> {
    const [team, rows] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId }, select: { code: true } }),
      this.computeRows(100_000),
    ]);
    const entry = rows.find((e) => e.teamCode === team?.code);
    if (!entry) return { rank: null, entry: null };
    return { rank: entry.rank, entry };
  }

  /**
   * Ranked aggregate over terminal sessions (COMPLETED / TIMEOUT): sum of
   * scores desc, sum of time asc, then team name asc. Only teams that have
   * finished at least one game appear.
   */
  private async computeRows(limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.$queryRaw<LeaderboardRow[]>(Prisma.sql`
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
}
