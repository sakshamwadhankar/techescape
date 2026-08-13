import { DocumentBuilder, type SwaggerDocumentOptions } from "@nestjs/swagger";
import { ADMIN_COOKIE, PLAYER_COOKIE } from "./common/constants";

export const SWAGGER_DOC_PATH = "api/docs";

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle("Spider-Man IEEE Event Platform API")
    .setDescription(
      "REST API for the Spider-Man themed IEEE event platform.\n\n" +
        "Auth uses HTTP-only cookies: `spm_access_token` (player) and `spm_admin_token` (admin). " +
        "Player and admin routes are marked with the matching cookie security scheme. " +
        "See `docs/frontend.md` (integration guide) and `docs/api.md` (full reference).",
    )
    .setVersion("0.1.0")
    .addServer("/api", "The platform prefix — all routes live under /api.")
    .addCookieAuth(PLAYER_COOKIE, { type: "apiKey", in: "cookie" }, PLAYER_COOKIE)
    .addCookieAuth(ADMIN_COOKIE, { type: "apiKey", in: "cookie" }, ADMIN_COOKIE)
    .addTag("auth", "Player + admin authentication")
    .addTag("players", "Authenticated player status")
    .addTag("wordle", "Wordle — guess the 5-letter word")
    .addTag("shadow", "Guess the Character by Shadow")
    .addTag("cards", "Match the Cards")
    .addTag("leaderboard", "Round standings")
    .addTag("admin", "Round control, roster and team resets (admin cookie)")
    .build();
}

export const swaggerDocumentOptions: SwaggerDocumentOptions = {
  operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
};
