import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import * as bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "crypto";
import { getEnv } from "./env";
import { ADMIN_COOKIE, ADMIN_TOKEN_TTL_SECONDS, PLAYER_COOKIE, PLAYER_TOKEN_TTL_SECONDS } from "./constants";
import { prisma } from "./db";

export interface PlayerPayload {
  sub: string; // teamId
  code: string;
  role: "player";
}

export interface AdminPayload {
  sub: "admin";
  role: "admin";
}

export function safeEqual(a: string, b: string): boolean {
  const aHash = createHash("sha256").update(a).digest();
  const bHash = createHash("sha256").update(b).digest();
  return timingSafeEqual(aHash, bHash);
}

export async function playerLogin(accessCode: string, pin: string) {
  const env = getEnv();
  if (!safeEqual(pin, env.EVENT_PIN)) {
    throw new Error("Invalid access code or PIN");
  }

  const team = await prisma.team.findUnique({
    where: { accessCode },
    select: { id: true, code: true, name: true, memberNames: true, room: true },
  });

  if (!team) {
    throw new Error("Invalid access code or PIN");
  }

  return team;
}

export async function signPlayerToken(teamId: string, code: string): Promise<string> {
  const env = getEnv();
  return jwt.sign(
    { sub: teamId, code, role: "player" } as PlayerPayload,
    env.JWT_SECRET,
    { expiresIn: PLAYER_TOKEN_TTL_SECONDS }
  );
}

export async function adminLogin(username: string, password: string): Promise<string> {
  const env = getEnv();
  if (!safeEqual(username, env.ADMIN_USERNAME)) {
    throw new Error("Invalid admin credentials");
  }

  if (env.ADMIN_PASSWORD_HASH) {
    const ok = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
    if (!ok) throw new Error("Invalid admin credentials");
  } else {
    const plain = env.ADMIN_PASSWORD ?? "admin";
    if (!safeEqual(password, plain)) {
      throw new Error("Invalid admin credentials");
    }
  }

  return jwt.sign(
    { sub: "admin", role: "admin" } as AdminPayload,
    env.JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_TTL_SECONDS }
  );
}

export async function getAuthenticatedPlayer(): Promise<{ teamId: string; code: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PLAYER_COOKIE)?.value;
    if (!token) return null;

    const env = getEnv();
    const decoded = jwt.verify(token, env.JWT_SECRET) as PlayerPayload;
    if (decoded.role !== "player" || !decoded.sub) return null;

    return { teamId: decoded.sub, code: decoded.code };
  } catch {
    return null;
  }
}

export async function getAuthenticatedAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE)?.value;
    if (!token) return false;

    const env = getEnv();
    const decoded = jwt.verify(token, env.JWT_SECRET) as AdminPayload;
    return decoded.role === "admin" && decoded.sub === "admin";
  } catch {
    return false;
  }
}

export async function setPlayerCookie(token: string): Promise<void> {
  const env = getEnv();
  const cookieStore = await cookies();
  cookieStore.set(PLAYER_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: PLAYER_TOKEN_TTL_SECONDS,
  });
}

export async function setAdminCookie(token: string): Promise<void> {
  const env = getEnv();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_TOKEN_TTL_SECONDS,
  });
}

export async function clearCookie(name: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(name, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}
