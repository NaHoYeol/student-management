import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/role-check";

// PUT: 학생 연결 + 승인/거절
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status, studentId } = (await req.json()) as {
    status: string;
    studentId?: string;
  };

  if (!["APPROVED", "REJECTED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const link = await prisma.parentLink.findUnique({
    where: { id },
    include: { student: { select: { instructorId: true } } },
  });

  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 승인 시 학생 연결 필수
  if (status === "APPROVED") {
    const targetStudentId = studentId || link.studentId;
    if (!targetStudentId) {
      return NextResponse.json({ error: "학생을 선택해주세요." }, { status: 400 });
    }

    // 연결할 학생이 실제 학생 계정인지 확인
    const student = await prisma.user.findUnique({
      where: { id: targetStudentId },
      select: { role: true },
    });

    if (!student || student.role !== "STUDENT") {
      return NextResponse.json({ error: "해당 학생을 연결할 수 없습니다." }, { status: 403 });
    }

    const updated = await prisma.parentLink.update({
      where: { id },
      data: { status: "APPROVED", studentId: targetStudentId },
    });
    return NextResponse.json(updated);
  }

  // 거절
  const updated = await prisma.parentLink.update({
    where: { id },
    data: { status: "REJECTED" },
  });

  return NextResponse.json(updated);
}
