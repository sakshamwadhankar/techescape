import { ApiExtraModels, ApiProperty, getSchemaPath } from "@nestjs/swagger";
import {
  GAME_KINDS,
  SESSION_STATUSES,
  type ApiErrorBody,
  type GameKind,
  type PlayerStatusResponse,
  type SessionStatus,
  type SessionSummary,
  type TeamSummary,
} from "@spiderman/types";

export class TeamSummaryDto implements TeamSummary {
  @ApiProperty({ description: "Team id (cuid).", example: "cmspz6z310001z9fcyi80n24h" })
  id: string;

  @ApiProperty({
    description: "Roster code, lowercased — doubles as the player access code.",
    example: "teama",
  })
  code: string;

  @ApiProperty({ description: "Display name.", example: "Team Alpha" })
  name: string;

  @ApiProperty({ type: [String], description: "Team member names.", example: ["A1", "A2"] })
  memberNames: string[];

  @ApiProperty({ type: String, nullable: true, description: "Room label, if any.", example: "A101" })
  room: string | null;
}

export class SessionSummaryDto implements SessionSummary {
  @ApiProperty({ enum: [...GAME_KINDS], description: "Game kind." })
  game: GameKind;

  @ApiProperty({ enum: [...SESSION_STATUSES], description: "Session status." })
  status: SessionStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "date-time",
    description: "When the session started.",
  })
  startedAt: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "date-time",
    description: "Server-side expiry — the countdown is visual only.",
  })
  expiresAt: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "date-time",
    description: "When the session was finalized.",
  })
  finishedAt: string | null;

  @ApiProperty({ type: Number, nullable: true, description: "Final score, when terminal." })
  score: number | null;
}

@ApiExtraModels(SessionSummaryDto)
export class PlayerStatusResponseDto implements PlayerStatusResponse {
  @ApiProperty({ type: TeamSummaryDto })
  team: TeamSummary;

  @ApiProperty({
    additionalProperties: { $ref: getSchemaPath(SessionSummaryDto) },
    description: "One session summary per game.",
  })
  sessions: Record<GameKind, SessionSummary>;

  @ApiProperty({ description: "Whether the round is currently ACTIVE." })
  roundOpen: boolean;
}

export class ApiErrorBodyDto implements ApiErrorBody {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({ example: "Conflict" })
  error: string;

  @ApiProperty({
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    description: "Human-readable error message(s).",
  })
  message: string | string[];
}
