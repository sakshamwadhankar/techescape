import { NextResponse } from "next/server";
import { clearCookie } from "@/server/auth";
import { PLAYER_COOKIE } from "@/server/constants";

export async function POST() {
  await clearCookie(PLAYER_COOKIE);
  return NextResponse.json({ ok: true });
}
