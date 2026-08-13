import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
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
import { PLAYER_COOKIE } from "../../common/constants";
import { ApiErrorBodyDto } from "../../dto/common.dto";
import {
  FinishBodyDto,
  GameFinishResponseDto,
  StartGameBodyDto,
  WordleGuessBodyDto,
  WordleGuessResponseDto,
  WordleStartResponseDto,
} from "../../dto/wordle.dto";

@ApiTags("wordle")
@Controller("games/wordle")
@UseGuards(JwtAuthGuard)
@ApiCookieAuth(PLAYER_COOKIE)
export class WordleController {
  constructor(@Inject(WordleService) private readonly wordle: WordleService) {}

  @Post("start")
  @ApiOperation({
    summary: "Start Wordle",
    description: "Starts or re-opens the team's Wordle session. The answer is never returned.",
  })
  @ApiBody({ type: StartGameBodyDto, required: false })
  @ApiOkResponse({ type: WordleStartResponseDto })
  @ApiConflictResponse({
    type: ApiErrorBodyDto,
    description: "Round closed/paused, game disabled, or game already completed.",
  })
  async start(@CurrentTeam() team: PlayerAuth): Promise<WordleStartResponse> {
    return this.wordle.start(team.teamId);
  }

  @Post("guess")
  @ApiOperation({ summary: "Submit a guess", description: "Submits a 5-letter word guess and returns feedback only." })
  @ApiBody({ type: WordleGuessBodyDto })
  @ApiOkResponse({ type: WordleGuessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: "Not a valid 5-letter dictionary word." })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: "No session for this team (start first)." })
  @ApiConflictResponse({ type: ApiErrorBodyDto, description: "Session busy or game already completed." })
  async guess(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(wordleGuessSchema)) body: WordleGuess,
  ): Promise<WordleGuessResponse> {
    return this.wordle.guess(team.teamId, body.guess, body.clientActionId);
  }

  @Post("finish")
  @ApiOperation({
    summary: "Finish Wordle",
    description: "Finalizes an expired session as TIMEOUT or returns the stored result for a terminal session.",
  })
  @ApiBody({ type: FinishBodyDto })
  @ApiOkResponse({ type: GameFinishResponseDto })
  @ApiConflictResponse({ type: ApiErrorBodyDto, description: "Session still in progress and not expired." })
  async finish(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(wordleFinishSchema)) body: WordleFinish,
  ): Promise<GameFinishResponse> {
    return this.wordle.finish(team.teamId, body.clientActionId);
  }
}
