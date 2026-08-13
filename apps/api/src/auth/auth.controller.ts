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
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
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
import { ApiErrorBodyDto } from "../dto/common.dto";
import {
  AdminLoginDto,
  AdminLoginResponseDto,
  MeResponseDto,
  OkResponseDto,
  PlayerLoginDto,
  PlayerLoginResponseDto,
} from "../dto/auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post("player/login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Player login", description: "Logs a team in with its access code and the shared event PIN; sets the `spm_access_token` cookie." })
  @ApiBody({ type: PlayerLoginDto })
  @ApiOkResponse({ type: PlayerLoginResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: "Wrong access code or PIN." })
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
  @ApiOperation({ summary: "Player logout", description: "Clears the player cookie." })
  @ApiOkResponse({ type: OkResponseDto })
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    this.auth.clearAuthCookie(res, PLAYER_COOKIE);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @ApiCookieAuth(PLAYER_COOKIE)
  @ApiOperation({ summary: "Current player", description: "Returns the authenticated team." })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: "No valid player cookie." })
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
  @ApiOperation({ summary: "Admin login", description: "Logs an admin in; sets the `spm_admin_token` cookie." })
  @ApiBody({ type: AdminLoginDto })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: "Wrong admin credentials." })
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
  @ApiOperation({ summary: "Admin logout", description: "Clears the admin cookie." })
  @ApiOkResponse({ type: OkResponseDto })
  adminLogout(@Res({ passthrough: true }) res: Response): { ok: true } {
    this.auth.clearAuthCookie(res, ADMIN_COOKIE);
    return { ok: true };
  }
}
