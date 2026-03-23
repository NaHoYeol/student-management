import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/role-check";

// GET: Get settings (Admin only) - returns masked API key (per-instructor)
export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key_userId: { key: "openai_api_key", userId: session.user.id } },
    });

    const value = setting?.value || "";
    const masked = value && value !== "x"
      ? value.slice(0, 7) + "..." + value.slice(-4)
      : "";

    return NextResponse.json({ hasKey: !!value && value !== "x", masked });
  } catch {
    return NextResponse.json({ hasKey: false, masked: "" });
  }
}

// PUT: Update API key (Admin only, per-instructor)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { apiKey } = (await req.json()) as { apiKey: string };

  try {
    await prisma.setting.upsert({
      where: { key_userId: { key: "openai_api_key", userId: session.user.id } },
      update: { value: apiKey },
      create: { key: "openai_api_key", value: apiKey, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Settings save error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
