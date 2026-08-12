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
import { ADMIN_COOKIE } from "../constants";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = (req.cookies as Record<string, string> | undefined)?.[ADMIN_COOKIE];
    if (!token) throw new UnauthorizedException("Admin authentication required");

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>("JWT_SECRET"),
      });
      if (payload.role !== "admin") throw new Error("wrong role");
      req.user = { role: "admin", sub: payload.sub as string };
      return true;
    } catch {
      throw new UnauthorizedException("Admin session expired");
    }
  }
}
