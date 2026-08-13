import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentTeam } from "../common/decorators/current-team.decorator";
import type { PlayerAuth } from "../common/guards/jwt-auth.guard";
import { PlayersService } from "./players.service";
import type { PlayerStatusResponse } from "@spiderman/types";
import { PLAYER_COOKIE } from "../common/constants";
import { PlayerStatusResponseDto } from "../dto/common.dto";

@ApiTags("players")
@Controller("players")
@UseGuards(JwtAuthGuard)
@ApiCookieAuth(PLAYER_COOKIE)
export class PlayersController {
  constructor(
    @Inject(PlayersService) private readonly players: PlayersService,
  ) {}

  @Get("me")
  @ApiOperation({
    summary: "Player status",
    description: "Team profile, per-game session status and whether the round is open.",
  })
  @ApiOkResponse({ type: PlayerStatusResponseDto })
  async me(@CurrentTeam() team: PlayerAuth): Promise<PlayerStatusResponse> {
    return this.players.status(team.teamId);
  }
}
