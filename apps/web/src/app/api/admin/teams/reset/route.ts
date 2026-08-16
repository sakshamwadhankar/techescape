import { NextResponse } from "next/server";
import { adminTeamResetSchema } from "@spiderman/validation";
import { getAuthenticatedAdmin } from "@/server/auth";
import { resetAdminTeam } from "@/server/services/admin.service";

export async function POST(req: Request) {
  const isAdmin = await getAuthenticatedAdmin();
  if (!isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = adminTeamResetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const result = await resetAdminTeam(parsed.data);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error resetting team";
    return NextResponse.json({ message }, { status: 400 });
  }
}
