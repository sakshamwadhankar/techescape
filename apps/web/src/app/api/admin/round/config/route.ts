import { NextResponse } from "next/server";
import { adminRoundConfigSchema } from "@spiderman/validation";
import { getAuthenticatedAdmin } from "@/server/auth";
import { updateAdminConfig } from "@/server/services/admin.service";

export async function POST(req: Request) {
  const isAdmin = await getAuthenticatedAdmin();
  if (!isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = adminRoundConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const updated = await updateAdminConfig(parsed.data);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error updating round config";
    return NextResponse.json({ message }, { status: 409 });
  }
}
