import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  adminRoundConfigSchema,
  adminTeamResetSchema,
  rosterImportSchema,
  type AdminRoundConfig,
  type AdminTeamReset,
  type RosterImport,
} from "@spiderman/validation";
import type {
  AdminRoundStatusResponse,
  AdminTeamsResponse,
  RosterImportResponse,
} from "@spiderman/types";
import { zodValidate } from "../common/pipes/zod-validation.pipe";
import { AdminAuthGuard } from "../common/guards/admin-auth.guard";
import { AdminService } from "./admin.service";
import { ADMIN_COOKIE } from "../common/constants";
import { ApiErrorBodyDto } from "../dto/common.dto";
import {
  AdminRoundConfigBodyDto,
  AdminRoundStatusResponseDto,
  AdminTeamResetBodyDto,
  AdminTeamsResponseDto,
  RosterImportBodyDto,
  RosterImportResponseDto,
  TeamResetResponseDto,
} from "../dto/admin.dto";

@ApiTags("admin")
@Controller("admin")
@UseGuards(AdminAuthGuard)
@ApiCookieAuth(ADMIN_COOKIE)
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
  ) {}

  @Post("roster/import")
  @ApiOperation({ summary: "Import roster", description: "Upserts teams from a list. Codes become the lowercased player access codes." })
  @ApiBody({ type: RosterImportBodyDto })
  @ApiOkResponse({ type: RosterImportResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: "Case-colliding codes or access-code clashes." })
  importRoster(
    @Body(zodValidate(rosterImportSchema)) body: RosterImport,
  ): Promise<RosterImportResponse> {
    return this.admin.importRoster(body);
  }

  @Get("round")
  @ApiOperation({ summary: "Round status", description: "Round status and configuration." })
  @ApiOkResponse({ type: AdminRoundStatusResponseDto })
  getRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.getRoundStatus();
  }

  @Post("round/config")
  @ApiOperation({ summary: "Update round config", description: "Toggles games and sets wordleAnswer / cardsSeed. Any subset of fields." })
  @ApiBody({ type: AdminRoundConfigBodyDto })
  @ApiOkResponse({ type: AdminRoundStatusResponseDto })
  @ApiConflictResponse({ type: ApiErrorBodyDto, description: "Round is ACTIVE — config is locked." })
  updateConfig(
    @Body(zodValidate(adminRoundConfigSchema)) body: AdminRoundConfig,
  ): Promise<AdminRoundStatusResponse> {
    return this.admin.updateConfig(body);
  }

  @Post("round/start")
  @ApiOperation({ summary: "Start round", description: "IDLE or ENDED → ACTIVE. Sets startedAt and expiresAt." })
  @ApiOkResponse({ type: AdminRoundStatusResponseDto })
  startRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.startRound();
  }

  @Post("round/pause")
  @ApiOperation({ summary: "Pause round", description: "ACTIVE → PAUSED. Records pausedAt." })
  @ApiOkResponse({ type: AdminRoundStatusResponseDto })
  pauseRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.pauseRound();
  }

  @Post("round/resume")
  @ApiOperation({ summary: "Resume round", description: "PAUSED → ACTIVE. Shifts expiresAt so pause time is not counted." })
  @ApiOkResponse({ type: AdminRoundStatusResponseDto })
  resumeRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.resumeRound();
  }

  @Post("round/end")
  @ApiOperation({ summary: "End round", description: "ACTIVE or PAUSED → ENDED." })
  @ApiOkResponse({ type: AdminRoundStatusResponseDto })
  endRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.endRound();
  }

  @Get("teams")
  @ApiOperation({ summary: "List teams", description: "Roster with per-game session rows and totalScore." })
  @ApiOkResponse({ type: AdminTeamsResponseDto })
  listTeams(): Promise<AdminTeamsResponse> {
    return this.admin.listTeams();
  }

  @Post("teams/reset")
  @ApiOperation({ summary: "Reset team", description: "Marks finished sessions ABANDONED so the team can replay. In-progress sessions are untouched." })
  @ApiBody({ type: AdminTeamResetBodyDto })
  @ApiOkResponse({ type: TeamResetResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: "Unknown teamId." })
  resetTeam(
    @Body(zodValidate(adminTeamResetSchema)) body: AdminTeamReset,
  ): Promise<{ reset: number }> {
    return this.admin.resetTeam(body);
  }
}
