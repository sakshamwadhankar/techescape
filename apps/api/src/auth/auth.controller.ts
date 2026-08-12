import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  adminLoginSchema,
  playerLoginSchema,
} from "@spiderman/validation";
import { zodValidate } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { CurrentTeam } from "../common/decorators/current-team.decorator";
import { ADMIN_COOKIE, PLAYER_COOKIE } from "../common/constants";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PrismaService } from "../common/prisma/prisma.service";
import type { PlayerAuth } from "../common/guards/jwt-auth.guard";
import type { TeamSummary } from "@spiderman/types";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post("player/login")
  @HttpCode(HttpStatus.OK)
  async playerLogin(
    @Body(zodValidate(playerLoginSchema)) body: { accessCode: string; pin: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ team: TeamSummary }> {
    const team = await this.auth.playerLogin(body.accessCode, body.pin);
    const session = await this.auth.signPlayerToken(team.teamId, team.code);
    this.auth.setAuthCookie(res, session);

    const fullTeam = await this.prisma.team.findUniqueOrThrow({
      where: { id: team.teamId },
    });
    return {
      team: {
        id: fullTeam.id,
        code: fullTeam.code,
        name: fullTeam.name,
        memberNames: fullTeam.memberNames,
        room: fullTeam.room,
      },
    };
  }

  @Post("player/logout")
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    this.auth.clearAuthCookie(res, PLAYER_COOKIE);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentTeam() team: PlayerAuth): Promise<{ team: TeamSummary }> {
    const fullTeam = await this.prisma.team.findUniqueOrThrow({
      where: { id: team.teamId },
    });
    return {
      team: {
        id: fullTeam.id,
        code: fullTeam.code,
        name: fullTeam.name,
        memberNames: fullTeam.memberNames,
        room: fullTeam.room,
      },
    };
  }

  @Post("admin/login")
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body(zodValidate(adminLoginSchema)) body: { username: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ role: "admin" }> {
    const session = await this.auth.adminLogin(body.username, body.password);
    this.auth.setAuthCookie(res, session);
    return { role: "admin" };
  }

  @Post("admin/logout")
  @HttpCode(HttpStatus.OK)
  adminLogout(@Res({ passthrough: true }) res: Response): { ok: true } {
    this.auth.clearAuthCookie(res, ADMIN_COOKIE);
    return { ok: true };
  }
}
