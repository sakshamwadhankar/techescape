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
  CardsMoveResponse,
  CardsStartResponse,
  GameFinishResponse,
} from "@spiderman/types";
import { cardsFinishSchema, cardsMoveSchema } from "@spiderman/validation";
import type { CardsFinish, CardsMove } from "@spiderman/validation";
import { zodValidate } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { PlayerAuth } from "../../common/guards/jwt-auth.guard";
import { CurrentTeam } from "../../common/decorators/current-team.decorator";
import { CardsService } from "./cards.service";
import { PLAYER_COOKIE } from "../../common/constants";
import { ApiErrorBodyDto } from "../../dto/common.dto";
import { FinishBodyDto, GameFinishResponseDto } from "../../dto/wordle.dto";
import {
  CardsMoveBodyDto,
  CardsMoveResponseDto,
  CardsStartResponseDto,
} from "../../dto/cards.dto";

@ApiTags("cards")
@Controller("games/cards")
@UseGuards(JwtAuthGuard)
@ApiCookieAuth(PLAYER_COOKIE)
export class CardsController {
  constructor(@Inject(CardsService) private readonly cards: CardsService) {}

  @Post("start")
  @ApiOperation({
    summary: "Start Cards",
    description: "Starts or re-opens the team's Cards session and returns the board positions (fronts hidden).",
  })
  @ApiOkResponse({ type: CardsStartResponseDto })
  @ApiConflictResponse({
    type: ApiErrorBodyDto,
    description: "Round closed/paused, game disabled, or game already completed.",
  })
  async start(@CurrentTeam() team: PlayerAuth): Promise<CardsStartResponse> {
    return this.cards.start(team.teamId);
  }

  @Post("move")
  @ApiOperation({
    summary: "Flip a card",
    description: "Flips one card; the front asset is revealed only on this flip. Two face-up cards resolve a match attempt.",
  })
  @ApiBody({ type: CardsMoveBodyDto })
  @ApiOkResponse({ type: CardsMoveResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: "Unknown cardId or malformed body." })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: "No session for this team (start first)." })
  @ApiConflictResponse({
    type: ApiErrorBodyDto,
    description: "Card already matched/revealed, session busy, or game already completed.",
  })
  async move(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(cardsMoveSchema)) body: CardsMove,
  ): Promise<CardsMoveResponse> {
    return this.cards.move(team.teamId, body.cardId, body.clientActionId);
  }

  @Post("finish")
  @ApiOperation({
    summary: "Finish Cards",
    description: "Finalizes an expired session as TIMEOUT or returns the stored result for a terminal session.",
  })
  @ApiBody({ type: FinishBodyDto })
  @ApiOkResponse({ type: GameFinishResponseDto })
  @ApiConflictResponse({ type: ApiErrorBodyDto, description: "Session still in progress and not expired." })
  async finish(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(cardsFinishSchema)) body: CardsFinish,
  ): Promise<GameFinishResponse> {
    return this.cards.finish(team.teamId, body.clientActionId);
  }
}
