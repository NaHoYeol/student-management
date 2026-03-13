import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List all class options (available to all authenticated users)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const grouped: Record<string, string[]> = {
    school: [],
    grade: [],
    classDay: [],
    classTime: [],
  };

  try {
    const options = await prisma.classOption.findMany({
      orderBy: [{ type: "asc" }, { value: "asc" }],
    });
    for (const o of options) {
      if (grouped[o.type]) grouped[o.type].push(o.value);
    }
  } catch {
    // Table may not exist yet — return empty options
  }

  return NextResponse.json(grouped);
}

// POST: Add a class option (Admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, value } = (await req.json()) as { type: string; value: string };

  if (!type || !value?.trim()) {
    return NextResponse.json({ error: "type과 value는 필수입니다." }, { status: 400 });
  }

  const option = await prisma.classOption.upsert({
    where: { type_value: { type, value: value.trim() } },
    update: {},
    create: { type, value: value.trim() },
  });

  return NextResponse.json(option, { status: 201 });
}

// DELETE: Remove a class option (Admin only)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, value } = (await req.json()) as { type: string; value: string };

  await prisma.classOption.deleteMany({ where: { type, value } });
  return NextResponse.json({ success: true });
}
