import { NextResponse } from "next/server";
import { getAuthenticatedPlayer } from "@/server/auth";
import { getMyLeaderboardRank } from "@/server/services/leaderboard.service";

export async function GET() {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getMyLeaderboardRank(auth.teamId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching team rank";
    return NextResponse.json({ message }, { status: 500 });
  }
}
