import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.use(cookieParser());

  const config = app.get(ConfigService);
  const origins = config
    .get<string>("CORS_ORIGINS", "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({ origin: origins, credentials: true, maxAge: 3600 });

  if (config.get<boolean>("TRUST_PROXY")) {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>("API_PORT", 4000);
  await app.listen(port);
   
  console.log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
