import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [
    {
      provide: RedisService,
      useFactory: (config: ConfigService): RedisService => {
        const url = config.get<string>("REDIS_URL", "redis://localhost:6379");
        const client = new Redis(url, {
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          lazyConnect: false,
        });
        return new RedisService(client);
      },
      inject: [ConfigService],
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
