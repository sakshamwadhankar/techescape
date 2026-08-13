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
  ShadowAnswerResponse,
  ShadowStartResponse,
} from "@spiderman/types";
import {
  shadowAnswerSchema,
  shadowFinishSchema,
} from "@spiderman/validation";
import type { ShadowAnswer, ShadowFinish } from "@spiderman/validation";
import { zodValidate } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { PlayerAuth } from "../../common/guards/jwt-auth.guard";
import { CurrentTeam } from "../../common/decorators/current-team.decorator";
import { ShadowService } from "./shadow.service";
import { PLAYER_COOKIE } from "../../common/constants";
import { ApiErrorBodyDto } from "../../dto/common.dto";
import { FinishBodyDto, GameFinishResponseDto } from "../../dto/wordle.dto";
import {
  ShadowAnswerBodyDto,
  ShadowAnswerResponseDto,
  ShadowStartResponseDto,
} from "../../dto/shadow.dto";

@ApiTags("shadow")
@Controller("games/shadow")
@UseGuards(JwtAuthGuard)
@ApiCookieAuth(PLAYER_COOKIE)
export class ShadowController {
  constructor(@Inject(ShadowService) private readonly shadow: ShadowService) {}

  @Post("start")
  @ApiOperation({
    summary: "Start Shadow",
    description: "Starts or re-opens the team's Shadow session and returns the round's questions (answers hidden).",
  })
  @ApiOkResponse({ type: ShadowStartResponseDto })
  @ApiConflictResponse({
    type: ApiErrorBodyDto,
    description: "Round closed/paused, game disabled, already completed, or no questions configured.",
  })
  async start(@CurrentTeam() team: PlayerAuth): Promise<ShadowStartResponse> {
    return this.shadow.start(team.teamId);
  }

  @Post("answer")
  @ApiOperation({
    summary: "Answer a question",
    description: "Submits an answer for a question; the correct answer is revealed only after the question resolves.",
  })
  @ApiBody({ type: ShadowAnswerBodyDto })
  @ApiOkResponse({ type: ShadowAnswerResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: "Unknown questionId or malformed body." })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: "No session for this team (start first)." })
  @ApiConflictResponse({
    type: ApiErrorBodyDto,
    description: "Question already resolved, attempts exhausted, session busy, or game already completed.",
  })
  async answer(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(shadowAnswerSchema)) body: ShadowAnswer,
  ): Promise<ShadowAnswerResponse> {
    return this.shadow.answer(team.teamId, body.questionId, body.answer, body.clientActionId);
  }

  @Post("finish")
  @ApiOperation({
    summary: "Finish Shadow",
    description: "Finalizes an expired session as TIMEOUT or returns the stored result for a terminal session.",
  })
  @ApiBody({ type: FinishBodyDto })
  @ApiOkResponse({ type: GameFinishResponseDto })
  @ApiConflictResponse({ type: ApiErrorBodyDto, description: "Session still in progress and not expired." })
  async finish(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(shadowFinishSchema)) body: ShadowFinish,
  ): Promise<GameFinishResponse> {
    return this.shadow.finish(team.teamId, body.clientActionId);
  }
}
