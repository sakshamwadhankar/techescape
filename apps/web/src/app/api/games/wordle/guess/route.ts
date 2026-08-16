import { NextResponse } from "next/server";
import { wordleGuessSchema } from "@spiderman/validation";
import { getAuthenticatedPlayer } from "@/server/auth";
import { wordleGuess } from "@/server/services/wordle.service";

export async function POST(req: Request) {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = wordleGuessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const response = await wordleGuess(
      auth.teamId,
      parsed.data.guess,
      parsed.data.clientActionId
    );
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error submitting guess";
    const status = message.includes("valid") ? 400 : 409;
    return NextResponse.json({ message }, { status });
  }
}
