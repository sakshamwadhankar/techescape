import { ApiProperty } from "@nestjs/swagger";
import type {
  ShadowAnswerResponse,
  ShadowQuestionPublic,
  ShadowStartResponse,
} from "@spiderman/types";

export class ShadowQuestionPublicDto implements ShadowQuestionPublic {
  @ApiProperty({ description: "Question id." })
  id: string;

  @ApiProperty({ description: "CDN URL of the character shadow image." })
  assetUrl: string;

  @ApiProperty({
    type: [String],
    description: "Answer options — includes the correct one (not identified).",
  })
  options: string[];
}

export class ShadowStartResponseDto implements ShadowStartResponse {
  @ApiProperty({ description: "Game session id." })
  sessionId: string;

  @ApiProperty({
    format: "date-time",
    description: "Server-side expiry — the countdown is visual only.",
  })
  expiresAt: string;

  @ApiProperty({
    type: [ShadowQuestionPublicDto],
    description: "Round questions in order; correct answers are hidden.",
  })
  questions: ShadowQuestionPublic[];

  @ApiProperty({ example: 3 })
  maxAttemptsPerQuestion: number;
}

export class ShadowAnswerBodyDto {
  @ApiProperty({ description: "Question id from start.", example: "cmspxk2y30006z963kwd5pf5a" })
  questionId: string;

  @ApiProperty({ description: "Chosen option; matched case-insensitively.", example: "Black Cat" })
  answer: string;

  @ApiProperty({
    description: "Idempotency key (8-64 chars, alphanumeric + `-`).",
    example: "answer-uuid",
  })
  clientActionId: string;
}

export class ShadowAnswerResponseDto implements ShadowAnswerResponse {
  @ApiProperty()
  questionId: string;

  @ApiProperty({ example: 0 })
  questionIndex: number;

  @ApiProperty()
  correct: boolean;

  @ApiProperty({
    description:
      "The correct answer. Returned only when `correct` is true — empty string otherwise.",
    example: "Black Cat",
  })
  correctAnswer: string;

  @ApiProperty({ example: 1 })
  attemptsUsed: number;

  @ApiProperty({ example: 2 })
  attemptsLeft: number;

  @ApiProperty({ example: 100 })
  questionScore: number;

  @ApiProperty({ example: 1 })
  totalCorrect: number;

  @ApiProperty({ example: 6 })
  questionCount: number;

  @ApiProperty({ enum: ["IN_PROGRESS", "COMPLETED", "TIMEOUT"] })
  status: ShadowAnswerResponse["status"];
}
