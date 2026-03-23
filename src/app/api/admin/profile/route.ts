import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/role-check";

// GET: 본인 강사 프로필 조회
export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, subject: true, academyName: true, isApproved: true },
  });

  return NextResponse.json(user);
}

// PUT: 강사 프로필 저장 (이름, 과목, 학원명)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, subject, academyName } = (await req.json()) as {
    name?: string;
    subject?: string;
    academyName?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "이름은 필수입니다" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: name.trim(),
      subject: subject?.trim() || null,
      academyName: academyName?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true });
}
