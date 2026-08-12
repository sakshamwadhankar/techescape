import { Module } from "@nestjs/common";
import { WordleController } from "./wordle.controller";
import { WordleService } from "./wordle.service";

@Module({
  controllers: [WordleController],
  providers: [WordleService],
})
export class WordleModule {}
