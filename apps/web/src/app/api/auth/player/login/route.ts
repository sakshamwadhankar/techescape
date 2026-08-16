import { NextResponse } from "next/server";
import { playerLoginSchema } from "@spiderman/validation";
import { playerLogin, setPlayerCookie, signPlayerToken } from "@/server/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = playerLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const team = await playerLogin(parsed.data.accessCode, parsed.data.pin);
    const token = await signPlayerToken(team.id, team.code);
    await setPlayerCookie(token);

    return NextResponse.json({
      team: {
        id: team.id,
        code: team.code,
        name: team.name,
        memberNames: team.memberNames,
        room: team.room,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid login";
    return NextResponse.json({ message }, { status: 400 });
  }
}
