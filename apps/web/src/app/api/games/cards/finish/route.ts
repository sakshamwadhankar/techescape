import { NextResponse } from "next/server";
import { cardsFinishSchema } from "@spiderman/validation";
import { getAuthenticatedPlayer } from "@/server/auth";
import { cardsFinish } from "@/server/services/cards.service";

export async function POST(req: Request) {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = cardsFinishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const response = await cardsFinish(auth.teamId, parsed.data.clientActionId);
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error finishing game";
    return NextResponse.json({ message }, { status: 409 });
  }
}
