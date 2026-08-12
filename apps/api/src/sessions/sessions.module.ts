import { Global, Module } from "@nestjs/common";
import { SessionsService } from "./sessions.service";
import { RoundService } from "./round.service";

@Global()
@Module({
  providers: [SessionsService, RoundService],
  exports: [SessionsService, RoundService],
})
export class SessionsModule {}
