import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Get my parent links
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const links = await prisma.parentLink.findMany({
    where: { parentId: session.user.id },
    include: {
      student: { select: { id: true, name: true, school: true, grade: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(links);
}

// POST: Create a new parent-student link request
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = (await req.json()) as { studentId: string };
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  // Verify student exists
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, role: true },
  });

  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // Check for existing link
  const existing = await prisma.parentLink.findUnique({
    where: {
      parentId_studentId: {
        parentId: session.user.id,
        studentId,
      },
    },
  });

  if (existing) {
    return NextResponse.json({ error: "이미 연결 요청이 존재합니다.", status: existing.status }, { status: 409 });
  }

  const link = await prisma.parentLink.create({
    data: {
      parentId: session.user.id,
      studentId,
    },
  });

  return NextResponse.json(link, { status: 201 });
}
