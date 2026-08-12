import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentTeam } from "../common/decorators/current-team.decorator";
import type { PlayerAuth } from "../common/guards/jwt-auth.guard";
import { PlayersService } from "./players.service";
import type { PlayerStatusResponse } from "@spiderman/types";

@Controller("players")
@UseGuards(JwtAuthGuard)
export class PlayersController {
  constructor(
    @Inject(PlayersService) private readonly players: PlayersService,
  ) {}

  @Get("me")
  async me(@CurrentTeam() team: PlayerAuth): Promise<PlayerStatusResponse> {
    return this.players.status(team.teamId);
  }
}
