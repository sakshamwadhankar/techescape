import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
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

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
  ) {}

  @Post("roster/import")
  importRoster(
    @Body(zodValidate(rosterImportSchema)) body: RosterImport,
  ): Promise<RosterImportResponse> {
    return this.admin.importRoster(body);
  }

  @Get("round")
  getRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.getRoundStatus();
  }

  @Post("round/config")
  updateConfig(
    @Body(zodValidate(adminRoundConfigSchema)) body: AdminRoundConfig,
  ): Promise<AdminRoundStatusResponse> {
    return this.admin.updateConfig(body);
  }

  @Post("round/start")
  startRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.startRound();
  }

  @Post("round/pause")
  pauseRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.pauseRound();
  }

  @Post("round/resume")
  resumeRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.resumeRound();
  }

  @Post("round/end")
  endRound(): Promise<AdminRoundStatusResponse> {
    return this.admin.endRound();
  }

  @Get("teams")
  listTeams(): Promise<AdminTeamsResponse> {
    return this.admin.listTeams();
  }

  @Post("teams/reset")
  resetTeam(
    @Body(zodValidate(adminTeamResetSchema)) body: AdminTeamReset,
  ): Promise<{ reset: number }> {
    return this.admin.resetTeam(body);
  }
}
