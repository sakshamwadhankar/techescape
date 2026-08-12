import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import type {
  GameFinishResponse,
  WordleGuessResponse,
  WordleStartResponse,
} from "@spiderman/types";
import {
  wordleFinishSchema,
  wordleGuessSchema,
} from "@spiderman/validation";
import type { WordleFinish, WordleGuess } from "@spiderman/validation";
import { zodValidate } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { PlayerAuth } from "../../common/guards/jwt-auth.guard";
import { CurrentTeam } from "../../common/decorators/current-team.decorator";
import { WordleService } from "./wordle.service";

@Controller("games/wordle")
@UseGuards(JwtAuthGuard)
export class WordleController {
  constructor(@Inject(WordleService) private readonly wordle: WordleService) {}

  @Post("start")
  async start(@CurrentTeam() team: PlayerAuth): Promise<WordleStartResponse> {
    return this.wordle.start(team.teamId);
  }

  @Post("guess")
  async guess(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(wordleGuessSchema)) body: WordleGuess,
  ): Promise<WordleGuessResponse> {
    return this.wordle.guess(team.teamId, body.guess, body.clientActionId);
  }

  @Post("finish")
  async finish(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(wordleFinishSchema)) body: WordleFinish,
  ): Promise<GameFinishResponse> {
    return this.wordle.finish(team.teamId, body.clientActionId);
  }
}
