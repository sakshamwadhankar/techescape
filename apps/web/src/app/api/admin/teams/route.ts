import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/server/auth";
import { listAdminTeams } from "@/server/services/admin.service";

export async function GET() {
  const isAdmin = await getAuthenticatedAdmin();
  if (!isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await listAdminTeams();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error listing teams";
    return NextResponse.json({ message }, { status: 500 });
  }
}
