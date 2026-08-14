import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash, timingSafeEqual } from "crypto";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Response } from "express";
import {
  ADMIN_TOKEN_TTL_SECONDS,
  PLAYER_COOKIE,
  PLAYER_TOKEN_TTL_SECONDS,
} from "../common/constants";

export interface AuthSession {
  token: string;
  cookieName: string;
  ttlSeconds: number;
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    this.secret = this.config.get<string>("JWT_SECRET", "change-me");
  }

  async playerLogin(
    accessCode: string,
    pin: string,
  ): Promise<{ teamId: string; code: string; name: string }> {
    const expectedPin = this.config.get<string>("EVENT_PIN", "");
    if (!this.safeEqual(pin, expectedPin)) {
      throw new UnauthorizedException("Invalid access code or PIN");
    }

    const team = await this.prisma.team.findUnique({
      where: { accessCode },
      select: { id: true, code: true, name: true },
    });
    if (!team) {
      throw new UnauthorizedException("Invalid access code or PIN");
    }

    return { teamId: team.id, code: team.code, name: team.name };
  }

  async signPlayerToken(teamId: string, code: string): Promise<AuthSession> {
    const token = await this.jwt.signAsync(
      { sub: teamId, code, role: "player" },
      { secret: this.secret, expiresIn: PLAYER_TOKEN_TTL_SECONDS },
    );
    return {
      token,
      cookieName: PLAYER_COOKIE,
      ttlSeconds: PLAYER_TOKEN_TTL_SECONDS,
    };
  }

  async adminLogin(username: string, password: string): Promise<AuthSession> {
    const expectedUsername = this.config.get<string>("ADMIN_USERNAME", "admin");
    if (!this.safeEqual(username, expectedUsername)) {
      throw new UnauthorizedException("Invalid admin credentials");
    }

    const hash = this.config.get<string>("ADMIN_PASSWORD_HASH");
    if (hash) {
      const ok = await bcrypt.compare(password, hash);
      if (!ok) throw new UnauthorizedException("Invalid admin credentials");
    } else {
      const plain = this.config.get<string>("ADMIN_PASSWORD");
      if (!plain || !this.safeEqual(password, plain)) {
        throw new UnauthorizedException("Invalid admin credentials");
      }
      if (this.config.get<string>("NODE_ENV") === "production") {
        this.logger.warn(
          "Admin authenticating against plain-text ADMIN_PASSWORD. Set ADMIN_PASSWORD_HASH in production.",
        );
      }
    }

    const token = await this.jwt.signAsync(
      { sub: "admin", role: "admin" },
      { secret: this.secret, expiresIn: ADMIN_TOKEN_TTL_SECONDS },
    );
    return {
      token,
      cookieName: "spm_admin_token",
      ttlSeconds: ADMIN_TOKEN_TTL_SECONDS,
    };
  }

  async createPasswordHash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  setAuthCookie(res: Response, session: AuthSession): void {
    const { secure, sameSite } = this.cookiePolicy();
    res.cookie(session.cookieName, session.token, {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: session.ttlSeconds * 1000,
    });
  }

  clearAuthCookie(res: Response, cookieName: string): void {
    const { secure, sameSite } = this.cookiePolicy();
    res.clearCookie(cookieName, { httpOnly: true, secure, sameSite, path: "/" });
  }

  private cookiePolicy(): { secure: boolean; sameSite: "lax" | "strict" | "none" } {
    return {
      secure: this.config.get<string>("COOKIE_SECURE") === "true",
      sameSite: this.config.get<"lax" | "strict" | "none">("COOKIE_SAMESITE", "lax"),
    };
  }

  getSecret(): string {
    return this.secret;
  }

  /**
   * Constant-time string comparison (length leak is acceptable here).
   */
  private safeEqual(a: string, b: string): boolean {
    const aHash = createHash("sha256").update(a).digest();
    const bHash = createHash("sha256").update(b).digest();
    return timingSafeEqual(aHash, bHash);
  }
}
