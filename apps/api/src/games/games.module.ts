import { Module } from "@nestjs/common";
import { WordleModule } from "./wordle/wordle.module";
import { ShadowModule } from "./shadow/shadow.module";
import { CardsModule } from "./cards/cards.module";

@Module({
  imports: [WordleModule, ShadowModule, CardsModule],
})
export class GamesModule {}
