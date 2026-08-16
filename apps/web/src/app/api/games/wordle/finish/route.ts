import { NextResponse } from "next/server";
import { wordleFinishSchema } from "@spiderman/validation";
import { getAuthenticatedPlayer } from "@/server/auth";
import { wordleFinish } from "@/server/services/wordle.service";

export async function POST(req: Request) {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = wordleFinishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const response = await wordleFinish(auth.teamId, parsed.data.clientActionId);
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error finishing game";
    return NextResponse.json({ message }, { status: 409 });
  }
}
