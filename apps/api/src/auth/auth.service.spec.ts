import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import type { PrismaService } from "../common/prisma/prisma.service";
import { ADMIN_COOKIE } from "../common/constants";

describe("AuthService cookie policy", () => {
  const session = {
    token: "jwt-token",
    cookieName: "spm_access_token",
    ttlSeconds: 3600,
  };

  function create(config: Record<string, string>) {
    const cfg = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in config ? config[key] : defaultValue,
      ),
    } as unknown as ConfigService;
    const auth = new AuthService({} as PrismaService, {} as JwtService, cfg);
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    return { auth, res };
  }

  it("defaults to SameSite=Lax and not secure", () => {
    const { auth, res } = create({});
    auth.setAuthCookie(res, session);
    expect(res.cookie).toHaveBeenCalledWith(
      session.cookieName,
      session.token,
      expect.objectContaining({ sameSite: "lax", secure: false, httpOnly: true }),
    );
  });

  it("applies COOKIE_SAMESITE=none with COOKIE_SECURE=true", () => {
    const { auth, res } = create({ COOKIE_SECURE: "true", COOKIE_SAMESITE: "none" });
    auth.setAuthCookie(res, session);
    expect(res.cookie).toHaveBeenCalledWith(
      session.cookieName,
      session.token,
      expect.objectContaining({ sameSite: "none", secure: true, httpOnly: true }),
    );
  });

  it("mirrors sameSite and secure attributes when clearing the cookie", () => {
    const { auth, res } = create({ COOKIE_SECURE: "true", COOKIE_SAMESITE: "none" });
    auth.clearAuthCookie(res, ADMIN_COOKIE);
    expect(res.clearCookie).toHaveBeenCalledWith(
      ADMIN_COOKIE,
      expect.objectContaining({ sameSite: "none", secure: true }),
    );
  });
});
