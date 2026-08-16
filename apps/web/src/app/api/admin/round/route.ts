import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/server/auth";
import { getAdminRoundStatus } from "@/server/services/admin.service";

export async function GET() {
  const isAdmin = await getAuthenticatedAdmin();
  if (!isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getAdminRoundStatus();
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error getting round status";
    return NextResponse.json({ message }, { status: 500 });
  }
}
