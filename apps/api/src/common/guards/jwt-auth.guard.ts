import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PLAYER_COOKIE } from "../constants";

export interface PlayerAuth {
  teamId: string;
  code: string;
  role: "player";
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = (req.cookies as Record<string, string> | undefined)?.[PLAYER_COOKIE];
    if (!token) throw new UnauthorizedException("Not authenticated");

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>("JWT_SECRET"),
      });
      if (payload.role !== "player") throw new Error("wrong role");
      req.user = {
        teamId: payload.sub as string,
        code: payload.code as string,
        role: "player",
      } satisfies PlayerAuth;
      return true;
    } catch {
      throw new UnauthorizedException("Session expired, please log in again");
    }
  }
}
