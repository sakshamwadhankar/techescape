import { NextResponse } from "next/server";
import { getAuthenticatedPlayer } from "@/server/auth";
import { wordleStart } from "@/server/services/wordle.service";

export async function POST() {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await wordleStart(auth.teamId);
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error starting game";
    return NextResponse.json({ message }, { status: 409 });
  }
}
