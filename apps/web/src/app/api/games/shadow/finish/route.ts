import { NextResponse } from "next/server";
import { shadowFinishSchema } from "@spiderman/validation";
import { getAuthenticatedPlayer } from "@/server/auth";
import { shadowFinish } from "@/server/services/shadow.service";

export async function POST(req: Request) {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = shadowFinishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const response = await shadowFinish(auth.teamId, parsed.data.clientActionId);
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error finishing game";
    return NextResponse.json({ message }, { status: 409 });
  }
}
