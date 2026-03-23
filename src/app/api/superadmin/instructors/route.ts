import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: 모든 강사(ADMIN) 목록
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const instructors = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: {
      id: true,
      name: true,
      email: true,
      subject: true,
      academyName: true,
      isApproved: true,
      approvedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(instructors);
}

// PUT: 강사 승인/거절
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { instructorId, action } = (await req.json()) as {
    instructorId: string;
    action: "approve" | "reject";
  };

  if (!instructorId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const instructor = await prisma.user.findUnique({
    where: { id: instructorId },
    select: { role: true },
  });

  if (!instructor || instructor.role !== "ADMIN") {
    return NextResponse.json({ error: "강사를 찾을 수 없습니다" }, { status: 404 });
  }

  if (action === "approve") {
    await prisma.user.update({
      where: { id: instructorId },
      data: { isApproved: true, approvedAt: new Date() },
    });
  } else {
    // 거절 시 계정 삭제
    await prisma.user.delete({ where: { id: instructorId } });
  }

  return NextResponse.json({ ok: true });
}

// DELETE: 강사 삭제
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const instructorId = searchParams.get("id");

  if (!instructorId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const instructor = await prisma.user.findUnique({
    where: { id: instructorId },
    select: { role: true },
  });

  if (!instructor || instructor.role !== "ADMIN") {
    return NextResponse.json({ error: "강사를 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.user.delete({ where: { id: instructorId } });

  return NextResponse.json({ ok: true });
}
