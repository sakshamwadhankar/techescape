import { ApiProperty } from "@nestjs/swagger";
import { TeamSummaryDto } from "./common.dto";

export class PlayerLoginDto {
  @ApiProperty({
    description: "Roster access code (lowercased team code).",
    example: "teama",
  })
  accessCode: string;

  @ApiProperty({ description: "Shared event PIN.", example: "1123" })
  pin: string;
}

export class PlayerLoginResponseDto {
  @ApiProperty({ type: TeamSummaryDto })
  team: TeamSummaryDto;
}

export class MeResponseDto {
  @ApiProperty({ type: TeamSummaryDto })
  team: TeamSummaryDto;
}

export class AdminLoginDto {
  @ApiProperty({ description: "Admin username.", example: "admin" })
  username: string;

  @ApiProperty({ description: "Admin password.", example: "••••••••" })
  password: string;
}

export class AdminLoginResponseDto {
  @ApiProperty({ example: "admin" })
  role: "admin";
}

export class OkResponseDto {
  @ApiProperty({ example: true })
  ok: true;
}
