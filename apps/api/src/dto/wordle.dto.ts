import { ApiProperty } from "@nestjs/swagger";
import type {
  GameFinishResponse,
  WordleFeedback,
  WordleGuessResponse,
  WordleStartResponse,
  WordleStatus,
} from "@spiderman/types";

export class StartGameBodyDto {
  @ApiProperty({
    required: false,
    description: "Idempotency key (8-64 chars, alphanumeric + `-`).",
    example: "start-uuid",
  })
  clientActionId?: string;
}

export class WordleStartResponseDto implements WordleStartResponse {
  @ApiProperty({ description: "Game session id." })
  sessionId: string;

  @ApiProperty({
    format: "date-time",
    description: "Server-side expiry — the countdown is visual only.",
  })
  expiresAt: string;

  @ApiProperty({ example: 6 })
  attemptsAllowed: number;

  @ApiProperty({ example: 5 })
  wordLength: number;
}

export class WordleFeedbackDto implements WordleFeedback {
  @ApiProperty({ example: "c" })
  letter: string;

  @ApiProperty({ enum: ["correct", "present", "absent"] })
  status: WordleFeedback["status"];
}

export class WordleGuessBodyDto {
  @ApiProperty({ description: "Exactly 5 letters, a real dictionary word.", example: "crane" })
  guess: string;

  @ApiProperty({
    description: "Idempotency key (8-64 chars, alphanumeric + `-`).",
    example: "guess-uuid",
  })
  clientActionId: string;
}

export class WordleGuessResponseDto implements WordleGuessResponse {
  @ApiProperty({ example: 1 })
  guessCount: number;

  @ApiProperty({ example: 5 })
  attemptsLeft: number;

  @ApiProperty({ type: [WordleFeedbackDto], description: "Per-letter feedback." })
  feedback: WordleFeedback[];

  @ApiProperty({ enum: ["IN_PROGRESS", "WON", "LOST", "TIMEOUT"] })
  wordleStatus: WordleStatus;
}

export class FinishBodyDto {
  @ApiProperty({
    description: "Idempotency key (8-64 chars, alphanumeric + `-`).",
    example: "finish-uuid",
  })
  clientActionId: string;
}

export class GameFinishResponseDto implements GameFinishResponse {
  @ApiProperty({ description: "Final score.", example: 800 })
  score: number;

  @ApiProperty({ description: "Milliseconds from session start to finalization.", example: 93211 })
  timeMs: number;
}
