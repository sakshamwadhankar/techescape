import { NextResponse } from "next/server";
import { getAuthenticatedPlayer } from "@/server/auth";
import { prisma } from "@/server/db";

export async function GET() {
  const auth = await getAuthenticatedPlayer();
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const fullTeam = await prisma.team.findUniqueOrThrow({
      where: { id: auth.teamId },
    });

    return NextResponse.json({
      team: {
        id: fullTeam.id,
        code: fullTeam.code,
        name: fullTeam.name,
        memberNames: fullTeam.memberNames,
        room: fullTeam.room,
      },
    });
  } catch {
    return NextResponse.json({ message: "Team not found" }, { status: 404 });
  }
}
