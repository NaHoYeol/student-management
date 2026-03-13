import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const student = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      school: true,
      grade: true,
      classDay: true,
      classTime: true,
      submissions: {
        select: {
          id: true,
          score: true,
          totalPoints: true,
          submittedAt: true,
          assignment: { select: { id: true, title: true, totalQuestions: true, analysisPublished: true } },
          answers: {
            select: { questionNumber: true, studentAnswer: true, isCorrect: true },
            orderBy: { questionNumber: "asc" },
          },
        },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(student);
}

// PUT: Admin edits student profile
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, school, grade, classDay, classTime } = body as {
    name?: string;
    school?: string;
    grade?: string;
    classDay?: string;
    classTime?: string;
  };

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(school !== undefined && { school }),
      ...(grade !== undefined && { grade }),
      ...(classDay !== undefined && { classDay }),
      ...(classTime !== undefined && { classTime }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      school: true,
      grade: true,
      classDay: true,
      classTime: true,
    },
  });

  return NextResponse.json(user);
}
