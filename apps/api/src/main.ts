import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import {
  buildSwaggerConfig,
  SWAGGER_DOC_PATH,
  swaggerDocumentOptions,
} from "./swagger.config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.use(cookieParser());

  const config = app.get(ConfigService);
  const origins = config
    .get<string>("CORS_ORIGINS", "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .map((o) => o.replace(/\/+$/, ""))
    .filter(Boolean);

  app.enableCors({ origin: origins, credentials: true, maxAge: 3600 });

  if (config.get<boolean>("TRUST_PROXY")) {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>("API_PORT", 4000);

  if (config.get<boolean>("ENABLE_SWAGGER", false)) {
    const document = SwaggerModule.createDocument(
      app,
      buildSwaggerConfig(),
      swaggerDocumentOptions,
    );
    SwaggerModule.setup(SWAGGER_DOC_PATH, app, document, {
      customSiteTitle: "Spider-Man Event API",
      swaggerOptions: { persistAuthorization: true },
    });
    console.log(`Swagger UI at http://localhost:${port}/${SWAGGER_DOC_PATH}`);
  }

  await app.listen(port);
   
  console.log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
