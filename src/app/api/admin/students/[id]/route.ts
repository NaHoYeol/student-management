import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/role-check";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
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
        where: { isAgent: false },
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
  if (!session?.user || !isAdmin(session.user.role)) {
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

// DELETE: Admin deletes a student and all related data
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "STUDENT") {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // Delete in order: analysis results, submission answers, submissions, accounts/sessions, then user
  await prisma.studentAnalysisResult.deleteMany({ where: { studentId: id } });
  await prisma.submissionAnswer.deleteMany({
    where: { submission: { studentId: id } },
  });
  await prisma.submission.deleteMany({ where: { studentId: id } });
  await prisma.account.deleteMany({ where: { userId: id } });
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
