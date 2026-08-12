import { Module } from "@nestjs/common";
import { WordleModule } from "./wordle/wordle.module";
import { ShadowModule } from "./shadow/shadow.module";

@Module({
  imports: [WordleModule, ShadowModule],
})
export class GamesModule {}
