import { NextResponse } from "next/server";
import { adminLoginSchema } from "@spiderman/validation";
import { adminLogin, setAdminCookie } from "@/server/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = adminLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const token = await adminLogin(parsed.data.username, parsed.data.password);
    await setAdminCookie(token);

    return NextResponse.json({ role: "admin" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid credentials";
    return NextResponse.json({ message }, { status: 401 });
  }
}
