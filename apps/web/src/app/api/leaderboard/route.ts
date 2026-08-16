import { NextResponse } from "next/server";
import { getTopLeaderboard } from "@/server/services/leaderboard.service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;

  try {
    const data = await getTopLeaderboard(clamped);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching leaderboard";
    return NextResponse.json({ message }, { status: 500 });
  }
}
