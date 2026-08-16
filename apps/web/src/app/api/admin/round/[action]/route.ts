import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/server/auth";
import {
  endAdminRound,
  pauseAdminRound,
  resumeAdminRound,
  startAdminRound,
} from "@/server/services/admin.service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const isAdmin = await getAuthenticatedAdmin();
  if (!isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { action } = await params;

  try {
    let result;
    switch (action) {
      case "start":
        result = await startAdminRound();
        break;
      case "pause":
        result = await pauseAdminRound();
        break;
      case "resume":
        result = await resumeAdminRound();
        break;
      case "end":
        result = await endAdminRound();
        break;
      default:
        return NextResponse.json({ message: `Unknown action: ${action}` }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : `Error running round action ${action}`;
    return NextResponse.json({ message }, { status: 409 });
  }
}
