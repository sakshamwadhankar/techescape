import { NextResponse } from "next/server";
import { shadowAnswerSchema } from "@spiderman/validation";
import { getAuthenticatedPlayer } from "@/server/auth";
import { shadowAnswer } from "@/server/services/shadow.service";

export async function POST(req: Request) {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = shadowAnswerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const response = await shadowAnswer(
      auth.teamId,
      parsed.data.questionId,
      parsed.data.answer,
      parsed.data.clientActionId
    );
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error submitting answer";
    const status = message.includes("Unknown question") ? 400 : 409;
    return NextResponse.json({ message }, { status });
  }
}
