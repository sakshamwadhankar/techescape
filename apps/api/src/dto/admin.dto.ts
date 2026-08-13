import { ApiProperty } from "@nestjs/swagger";
import {
  GAME_KINDS,
  SESSION_STATUSES,
  type AdminRoundStatusResponse,
  type AdminSessionRow,
  type AdminTeamRow,
  type AdminTeamsResponse,
  type GameKind,
  type RosterImportResponse,
  type RoundStatus,
  type SessionStatus,
} from "@spiderman/types";

export class AdminRoundStatusResponseDto implements AdminRoundStatusResponse {
  @ApiProperty({ example: 1 })
  number: number;

  @ApiProperty({ enum: ["IDLE", "ACTIVE", "PAUSED", "ENDED"] })
  status: RoundStatus;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  startedAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  pausedAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  expiresAt: string | null;

  @ApiProperty()
  wordleEnabled: boolean;

  @ApiProperty()
  shadowEnabled: boolean;

  @ApiProperty()
  cardsEnabled: boolean;

  @ApiProperty({ type: String, nullable: true, description: "Round wordle answer, if set." })
  wordleAnswer: string | null;

  @ApiProperty({ type: Number, nullable: true, description: "Cards board seed, if set." })
  cardsSeed: number | null;
}

export class AdminRoundConfigBodyDto {
  @ApiProperty({ required: false })
  wordleEnabled?: boolean;

  @ApiProperty({ required: false })
  shadowEnabled?: boolean;

  @ApiProperty({ required: false })
  cardsEnabled?: boolean;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: "Exactly 5 letters; null clears.",
    example: "spide",
  })
  wordleAnswer?: string | null;

  @ApiProperty({
    type: Number,
    required: false,
    nullable: true,
    description: "Positive integer; null clears.",
    example: 123,
  })
  cardsSeed?: number | null;
}

export class RosterEntryDto {
  @ApiProperty({
    description: "Team code — becomes the lowercased player access code.",
    example: "TEAMA",
  })
  code: string;

  @ApiProperty({ example: "Team Alpha" })
  name: string;

  @ApiProperty({ type: [String], description: "1-8 member names.", example: ["A1", "A2"] })
  memberNames: string[];

  @ApiProperty({ type: String, nullable: true, required: false, example: "A101" })
  room?: string | null;
}

export class RosterImportBodyDto {
  @ApiProperty({ type: [RosterEntryDto], description: "1-2000 teams." })
  teams: RosterEntryDto[];
}

export class RosterImportResponseDto implements RosterImportResponse {
  @ApiProperty({ example: 2 })
  created: number;

  @ApiProperty({ example: 0 })
  updated: number;

  @ApiProperty({ example: 2 })
  total: number;
}

export class AdminSessionRowDto implements AdminSessionRow {
  @ApiProperty({ enum: [...GAME_KINDS] })
  game: GameKind;

  @ApiProperty({ enum: [...SESSION_STATUSES] })
  status: SessionStatus;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  startedAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  expiresAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  finishedAt: string | null;

  @ApiProperty({ type: Number, nullable: true })
  score: number | null;

  @ApiProperty({ type: Number, nullable: true })
  timeMs: number | null;
}

export class AdminTeamRowDto implements AdminTeamRow {
  @ApiProperty({ example: "cmspz6z310001z9fcyi80n24h" })
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  memberNames: string[];

  @ApiProperty({ type: String, nullable: true })
  room: string | null;

  @ApiProperty({ type: [AdminSessionRowDto] })
  sessions: AdminSessionRow[];

  @ApiProperty({ example: 0 })
  totalScore: number;
}

export class AdminTeamsResponseDto implements AdminTeamsResponse {
  @ApiProperty({ type: [AdminTeamRowDto] })
  teams: AdminTeamRow[];

  @ApiProperty({ example: 2 })
  total: number;
}

export class AdminTeamResetBodyDto {
  @ApiProperty({ description: "Team id (cuid).", example: "cmspz6z310001z9fcyi80n24h" })
  teamId: string;

  @ApiProperty({
    enum: [...GAME_KINDS],
    required: false,
    description: "Game to reset; omit to reset all finished games for the team.",
  })
  game?: GameKind;
}

export class TeamResetResponseDto {
  @ApiProperty({ example: 1, description: "Number of sessions reset." })
  reset: number;
}
