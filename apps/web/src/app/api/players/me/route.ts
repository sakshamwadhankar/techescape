import { NextResponse } from "next/server";
import { getAuthenticatedPlayer } from "@/server/auth";
import { playerStatus } from "@/server/services/players.service";

export async function GET() {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await playerStatus(auth.teamId);
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching player status";
    return NextResponse.json({ message }, { status: 400 });
  }
}
