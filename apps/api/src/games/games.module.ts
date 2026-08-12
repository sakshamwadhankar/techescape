import { Module } from "@nestjs/common";
import { WordleModule } from "./wordle/wordle.module";

@Module({
  imports: [WordleModule],
})
export class GamesModule {}
