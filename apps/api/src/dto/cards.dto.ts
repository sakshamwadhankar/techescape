import { ApiProperty } from "@nestjs/swagger";
import type {
  CardPublic,
  CardsMoveResponse,
  CardsStartResponse,
  CardsStatePublic,
} from "@spiderman/types";

export class CardPublicDto implements CardPublic {
  @ApiProperty({ description: "Card id (uuid).", example: "a00c6eca-b097-430c-b799-b1fdcf6a22e1" })
  id: string;

  @ApiProperty({ description: "Position index on the 24-card board.", example: 0 })
  index: number;
}

export class CardsStartResponseDto implements CardsStartResponse {
  @ApiProperty({ description: "Game session id." })
  sessionId: string;

  @ApiProperty({
    format: "date-time",
    description: "Server-side expiry — the countdown is visual only.",
  })
  expiresAt: string;

  @ApiProperty({
    type: [CardPublicDto],
    description: "Board positions (ids only — fronts are hidden).",
  })
  cards: CardPublic[];

  @ApiProperty({ description: "Shared card back asset URL." })
  backAssetUrl: string;
}

export class CardsMoveBodyDto {
  @ApiProperty({
    description: "Card id (uuid) from start.",
    example: "a00c6eca-b097-430c-b799-b1fdcf6a22e1",
  })
  cardId: string;

  @ApiProperty({
    description: "Idempotency key (8-64 chars, alphanumeric + `-`).",
    example: "move-uuid",
  })
  clientActionId: string;
}

export class CardsStatePublicDto implements CardsStatePublic {
  @ApiProperty({ example: 1 })
  moves: number;

  @ApiProperty({ type: [Number], description: "Face-up, unmatched card indices." })
  revealed: number[];

  @ApiProperty({ type: [Number], description: "Matched card indices." })
  matched: string[];

  @ApiProperty({ example: 0 })
  matchedPairs: number;

  @ApiProperty({ example: 12 })
  totalPairs: number;

  @ApiProperty({ enum: ["IN_PROGRESS", "COMPLETED", "TIMEOUT"] })
  status: CardsStatePublic["status"];
}

export class CardsMoveResponseDto implements CardsMoveResponse {
  @ApiProperty({ description: "The idempotency key echoed back." })
  moveId: string;

  @ApiProperty()
  cardId: string;

  @ApiProperty({ description: "Front asset — revealed only on this flip." })
  frontAssetUrl: string;

  @ApiProperty({ description: "First card of an attempt is now face-up." })
  revealed: boolean;

  @ApiProperty()
  matched: boolean;

  @ApiProperty({ description: "This flip resolved a pair; both cards stay face-up." })
  matchCompleted: boolean;

  @ApiProperty({ description: "Attempt mismatched; both cards flip back." })
  unmatchedFlipBack: boolean;

  @ApiProperty({ type: CardsStatePublicDto })
  state: CardsStatePublic;
}
