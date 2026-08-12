import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AdminRoundConfig,
  AdminTeamReset,
  RosterImport,
} from "@spiderman/validation";
import type {
  AdminRoundStatusResponse,
  AdminSessionRow,
  AdminTeamRow,
  AdminTeamsResponse,
  RosterImportResponse,
} from "@spiderman/types";
import { PrismaService } from "../common/prisma/prisma.service";
import { RoundService } from "../sessions/round.service";
import { SessionsService } from "../sessions/sessions.service";

@Injectable()
export class AdminService {
  private readonly roundDurationSeconds: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RoundService) private readonly round: RoundService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.roundDurationSeconds = config.get<number>("ROUND_DURATION_SECONDS", 1800);
  }

  // --- Roster -----------------------------------------------------------------

  async importRoster(body: RosterImport): Promise<RosterImportResponse> {
    const entries = body.teams.map((t) => ({
      ...t,
      accessCode: t.code.toLowerCase(),
    }));

    const seen = new Map<string, string>();
    for (const e of entries) {
      const owner = seen.get(e.accessCode);
      if (owner) {
        throw new BadRequestException(
          `Duplicate access code "${e.accessCode}" (teams "${owner}" and "${e.code}")`,
        );
      }
      seen.set(e.accessCode, e.code);
    }

    const codes = entries.map((e) => e.code);
    const accessCodes = entries.map((e) => e.accessCode);

    const byCode = new Map(
      (await this.prisma.team.findMany({ where: { code: { in: codes } } })).map(
        (t) => [t.code, t],
      ),
    );

    const clashes = await this.prisma.team.findMany({
      where: { accessCode: { in: accessCodes }, code: { notIn: codes } },
    });
    const clash = clashes[0];
    if (clash) {
      throw new BadRequestException(
        `Access code "${clash.accessCode}" already belongs to team "${clash.code}"`,
      );
    }

    let created = 0;
    let updated = 0;
    for (const e of entries) {
      const existing = byCode.get(e.code);
      const room = e.room ?? null;
      if (existing) {
        const changed =
          existing.name !== e.name ||
          existing.memberNames.join("|") !== e.memberNames.join("|") ||
          existing.room !== room;
        if (changed) {
          await this.prisma.team.update({
            where: { code: e.code },
            data: { name: e.name, memberNames: e.memberNames, room },
          });
        }
        updated++;
      } else {
        await this.prisma.team.create({
          data: {
            code: e.code,
            accessCode: e.accessCode,
            name: e.name,
            memberNames: e.memberNames,
            room,
          },
        });
        created++;
      }
    }

    return { created, updated, total: entries.length };
  }

  // --- Round lifecycle ---------------------------------------------------------

  private toStatusResponse(round: {
    number: number;
    status: string;
    startedAt: Date | null;
    pausedAt: Date | null;
    expiresAt: Date | null;
    wordleEnabled: boolean;
    shadowEnabled: boolean;
    cardsEnabled: boolean;
    wordleAnswer: string | null;
    cardsSeed: number | null;
  }): AdminRoundStatusResponse {
    return {
      number: round.number,
      status: round.status as AdminRoundStatusResponse["status"],
      startedAt: round.startedAt ? round.startedAt.toISOString() : null,
      pausedAt: round.pausedAt ? round.pausedAt.toISOString() : null,
      expiresAt: round.expiresAt ? round.expiresAt.toISOString() : null,
      wordleEnabled: round.wordleEnabled,
      shadowEnabled: round.shadowEnabled,
      cardsEnabled: round.cardsEnabled,
      wordleAnswer: round.wordleAnswer,
      cardsSeed: round.cardsSeed,
    };
  }

  async getRoundStatus(): Promise<AdminRoundStatusResponse> {
    const round = await this.round.getRound();
    return this.toStatusResponse(round);
  }

  async updateConfig(input: AdminRoundConfig): Promise<AdminRoundStatusResponse> {
    const round = await this.round.getRound();
    if (round.status === "ACTIVE") {
      throw new ConflictException("Round config cannot change while the round is active");
    }

    const data: Record<string, unknown> = {};
    if (input.wordleEnabled !== undefined) data.wordleEnabled = input.wordleEnabled;
    if (input.shadowEnabled !== undefined) data.shadowEnabled = input.shadowEnabled;
    if (input.cardsEnabled !== undefined) data.cardsEnabled = input.cardsEnabled;
    if (input.wordleAnswer !== undefined) {
      data.wordleAnswer = input.wordleAnswer === null ? null : input.wordleAnswer;
    }
    if (input.cardsSeed !== undefined) {
      data.cardsSeed = input.cardsSeed === null ? null : input.cardsSeed;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Nothing to update");
    }

    const updated = await this.prisma.round.update({
      where: { number: round.number },
      data,
    });
    await this.round.invalidateCache();
    return this.toStatusResponse(updated);
  }

  async startRound(): Promise<AdminRoundStatusResponse> {
    const round = await this.round.getRound();
    if (round.status !== "IDLE" && round.status !== "ENDED") {
      throw new ConflictException(`The round cannot start from status "${round.status}"`);
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + this.roundDurationSeconds * 1000);
    const updated = await this.prisma.round.update({
      where: { number: round.number },
      data: { status: "ACTIVE", startedAt, expiresAt, pausedAt: null },
    });
    await this.round.invalidateCache();
    return this.toStatusResponse(updated);
  }

  async pauseRound(): Promise<AdminRoundStatusResponse> {
    const round = await this.round.getRound();
    if (round.status !== "ACTIVE") {
      throw new ConflictException(`Only an active round can be paused (status: "${round.status}")`);
    }

    const updated = await this.prisma.round.update({
      where: { number: round.number },
      data: { status: "PAUSED", pausedAt: new Date() },
    });
    await this.round.invalidateCache();
    return this.toStatusResponse(updated);
  }

  async resumeRound(): Promise<AdminRoundStatusResponse> {
    const round = await this.round.getRound();
    if (round.status !== "PAUSED" || !round.pausedAt) {
      throw new ConflictException(`Only a paused round can be resumed (status: "${round.status}")`);
    }

    const pausedMs = Date.now() - new Date(round.pausedAt).getTime();
    const expiresAt = new Date(
      new Date(round.expiresAt ?? Date.now()).getTime() + Math.max(0, pausedMs),
    );
    const updated = await this.prisma.round.update({
      where: { number: round.number },
      data: { status: "ACTIVE", pausedAt: null, expiresAt },
    });
    await this.round.invalidateCache();
    return this.toStatusResponse(updated);
  }

  async endRound(): Promise<AdminRoundStatusResponse> {
    const round = await this.round.getRound();
    if (round.status === "IDLE" || round.status === "ENDED") {
      throw new ConflictException(`The round cannot end from status "${round.status}"`);
    }

    const updated = await this.prisma.round.update({
      where: { number: round.number },
      data: { status: "ENDED" },
    });
    await this.round.invalidateCache();
    return this.toStatusResponse(updated);
  }

  // --- Teams --------------------------------------------------------------------

  private toSessionRow(session: {
    game: string;
    status: string;
    startedAt: Date;
    expiresAt: Date;
    finishedAt: Date | null;
    score: number;
    timeMs: number | null;
  }): AdminSessionRow {
    return {
      game: session.game as AdminSessionRow["game"],
      status: session.status as AdminSessionRow["status"],
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      finishedAt: session.finishedAt ? session.finishedAt.toISOString() : null,
      score: session.score,
      timeMs: session.timeMs,
    };
  }

  async listTeams(): Promise<AdminTeamsResponse> {
    const teams = await this.prisma.team.findMany({
      orderBy: { code: "asc" },
      include: { sessions: { orderBy: { game: "asc" } } },
    });

    const rows: AdminTeamRow[] = teams.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      memberNames: t.memberNames,
      room: t.room,
      sessions: t.sessions.map((s) => this.toSessionRow(s)),
      totalScore: t.sessions.reduce((acc, s) => acc + s.score, 0),
    }));

    return { teams: rows, total: rows.length };
  }

  async resetTeam(input: AdminTeamReset): Promise<{ reset: number }> {
    const team = await this.prisma.team.findUnique({ where: { id: input.teamId } });
    if (!team) throw new NotFoundException("Team not found");

    const sessions = await this.prisma.gameSession.findMany({
      where: { teamId: input.teamId, ...(input.game ? { game: input.game } : {}) },
    });
    if (sessions.length === 0) {
      throw new NotFoundException("No sessions for this team");
    }

    let reset = 0;
    for (const s of sessions) {
      if (s.status === "COMPLETED" || s.status === "TIMEOUT") {
        await this.sessions.resetSession(s.id);
        reset++;
      }
    }
    return { reset };
  }
}
