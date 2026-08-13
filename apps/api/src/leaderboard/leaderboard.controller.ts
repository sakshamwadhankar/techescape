import {
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { LeaderboardMeResponse, LeaderboardResponse } from "@spiderman/types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentTeam } from "../common/decorators/current-team.decorator";
import type { PlayerAuth } from "../common/guards/jwt-auth.guard";
import { LeaderboardService } from "./leaderboard.service";
import { PLAYER_COOKIE } from "../common/constants";
import {
  LeaderboardMeResponseDto,
  LeaderboardResponseDto,
} from "../dto/leaderboard.dto";

@ApiTags("leaderboard")
@Controller("leaderboard")
export class LeaderboardController {
  constructor(
    @Inject(LeaderboardService) private readonly leaderboard: LeaderboardService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Top teams",
    description: "Ranked teams with at least one terminal session. Order: totalScore desc, totalTimeMs asc, team name asc.",
  })
  @ApiOkResponse({ type: LeaderboardResponseDto })
  top(@Query("limit") limit?: string): Promise<LeaderboardResponse> {
    const parsed = limit ? Number.parseInt(limit, 10) : NaN;
    const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;
    return this.leaderboard.top(clamped);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @ApiCookieAuth(PLAYER_COOKIE)
  @ApiOperation({
    summary: "My rank",
    description: "The authenticated team's rank and entry, or null when it has not finished any game.",
  })
  @ApiOkResponse({ type: LeaderboardMeResponseDto })
  me(@CurrentTeam() team: PlayerAuth): Promise<LeaderboardMeResponse> {
    return this.leaderboard.me(team.teamId);
  }
}
