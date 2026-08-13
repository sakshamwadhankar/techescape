import { writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { buildSwaggerConfig, swaggerDocumentOptions } from "./swagger.config";

function findMonorepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Could not find monorepo root (pnpm-workspace.yaml)");
    dir = parent;
  }
}

async function generate(): Promise<void> {
  // `preview: true` skips lifecycle hooks so generating the spec does not need
  // a running Postgres/Redis.
  const app = await NestFactory.create(AppModule, { preview: true, logger: ["error"] });
  await app.init();

  const document = SwaggerModule.createDocument(
    app,
    buildSwaggerConfig(),
    swaggerDocumentOptions,
  );
  const outPath = join(findMonorepoRoot(__dirname), "docs", "openapi.json");
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`OpenAPI spec written to ${outPath}`);

  await app.close();
}

void generate().catch((err: unknown) => {
  console.error("Failed to generate OpenAPI spec:", err);
  process.exitCode = 1;
});
