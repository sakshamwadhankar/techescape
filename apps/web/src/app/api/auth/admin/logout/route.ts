import { NextResponse } from "next/server";
import { clearCookie } from "@/server/auth";
import { ADMIN_COOKIE } from "@/server/constants";

export async function POST() {
  await clearCookie(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
