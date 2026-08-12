import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
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

@Controller("games/cards")
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(@Inject(CardsService) private readonly cards: CardsService) {}

  @Post("start")
  async start(@CurrentTeam() team: PlayerAuth): Promise<CardsStartResponse> {
    return this.cards.start(team.teamId);
  }

  @Post("move")
  async move(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(cardsMoveSchema)) body: CardsMove,
  ): Promise<CardsMoveResponse> {
    return this.cards.move(team.teamId, body.cardId, body.clientActionId);
  }

  @Post("finish")
  async finish(
    @CurrentTeam() team: PlayerAuth,
    @Body(zodValidate(cardsFinishSchema)) body: CardsFinish,
  ): Promise<GameFinishResponse> {
    return this.cards.finish(team.teamId, body.clientActionId);
  }
}
