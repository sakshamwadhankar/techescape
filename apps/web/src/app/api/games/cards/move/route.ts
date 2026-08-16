import { NextResponse } from "next/server";
import { cardsMoveSchema } from "@spiderman/validation";
import { getAuthenticatedPlayer } from "@/server/auth";
import { cardsMove } from "@/server/services/cards.service";

export async function POST(req: Request) {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = cardsMoveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const response = await cardsMove(
      auth.teamId,
      parsed.data.cardId,
      parsed.data.clientActionId
    );
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error executing move";
    const status = message.includes("Unknown card") ? 400 : 409;
    return NextResponse.json({ message }, { status });
  }
}
