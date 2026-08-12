import {
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { LeaderboardMeResponse, LeaderboardResponse } from "@spiderman/types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentTeam } from "../common/decorators/current-team.decorator";
import type { PlayerAuth } from "../common/guards/jwt-auth.guard";
import { LeaderboardService } from "./leaderboard.service";

@Controller("leaderboard")
export class LeaderboardController {
  constructor(
    @Inject(LeaderboardService) private readonly leaderboard: LeaderboardService,
  ) {}

  @Get()
  top(@Query("limit") limit?: string): Promise<LeaderboardResponse> {
    const parsed = limit ? Number.parseInt(limit, 10) : NaN;
    const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;
    return this.leaderboard.top(clamped);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentTeam() team: PlayerAuth): Promise<LeaderboardMeResponse> {
    return this.leaderboard.me(team.teamId);
  }
}
