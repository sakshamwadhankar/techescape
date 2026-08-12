import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
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

@Controller("games/shadow")
@UseGuards(JwtAuthGuard)
export class ShadowController {
  constructor(@Inject(ShadowService) private readonly shadow: ShadowService) {}

  @Post("start")
  async start(@CurrentTeam() team: PlayerAuth): Promise<ShadowStartResponse> {
    return this.shadow.start(team.teamId);
  }

  @Post("answer")
  async answer(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(shadowAnswerSchema)) body: ShadowAnswer,
  ): Promise<ShadowAnswerResponse> {
    return this.shadow.answer(team.teamId, body.questionId, body.answer, body.clientActionId);
  }

  @Post("finish")
  async finish(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(shadowFinishSchema)) body: ShadowFinish,
  ): Promise<GameFinishResponse> {
    return this.shadow.finish(team.teamId, body.clientActionId);
  }
}
