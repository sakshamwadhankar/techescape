import { ApiProperty } from "@nestjs/swagger";
import type {
  LeaderboardEntry,
  LeaderboardMeResponse,
  LeaderboardResponse,
} from "@spiderman/types";

export class LeaderboardEntryDto implements LeaderboardEntry {
  @ApiProperty({ example: 1, description: "1-based rank." })
  rank: number;

  @ApiProperty({ example: "teama" })
  teamCode: string;

  @ApiProperty({ example: "Team Alpha" })
  teamName: string;

  @ApiProperty({ example: 1000 })
  totalScore: number;

  @ApiProperty({ example: 36 })
  totalTimeMs: number;

  @ApiProperty({ example: 1 })
  gamesCompleted: number;
}

export class LeaderboardResponseDto implements LeaderboardResponse {
  @ApiProperty({ type: [LeaderboardEntryDto] })
  entries: LeaderboardEntry[];

  @ApiProperty({ example: 2, description: "Total teams with a terminal session." })
  totalTeams: number;
}

export class LeaderboardMeResponseDto implements LeaderboardMeResponse {
  @ApiProperty({ type: Number, nullable: true, example: 1 })
  rank: number | null;

  @ApiProperty({
    type: LeaderboardEntryDto,
    nullable: true,
    description: "Null when the team has not finished any game.",
  })
  entry: LeaderboardEntry | null;
}
