import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gradeSubmission } from "@/lib/grading";

// GET: Get submissions (Admin sees all, Student sees own)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assignmentId = req.nextUrl.searchParams.get("assignmentId");

  try {
    const where =
      session.user.role === "ADMIN"
        ? assignmentId
          ? { assignmentId, isAgent: false }
          : { isAgent: false }
        : assignmentId
          ? { studentId: session.user.id, assignmentId, isAgent: false }
          : { studentId: session.user.id, isAgent: false };

    const submissions = await prisma.submission.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true } },
        assignment: { select: { id: true, title: true, totalQuestions: true } },
        answers: { orderBy: { questionNumber: "asc" } },
      },
      orderBy: { submittedAt: "desc" },
    });

    return NextResponse.json(submissions);
  } catch {
    // Fallback: query without isAgent filter (in case column doesn't exist yet)
    const where =
      session.user.role === "ADMIN"
        ? assignmentId
          ? { assignmentId }
          : {}
        : assignmentId
          ? { studentId: session.user.id, assignmentId }
          : { studentId: session.user.id };

    const submissions = await prisma.submission.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true } },
        assignment: { select: { id: true, title: true, totalQuestions: true } },
        answers: { orderBy: { questionNumber: "asc" } },
      },
      orderBy: { submittedAt: "desc" },
    });

    return NextResponse.json(submissions);
  }
}

// POST: Submit answers and auto-grade
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { assignmentId, answers } = body as {
    assignmentId: string;
    answers: { questionNumber: number; studentAnswer: string }[];
  };

  // Check if already submitted
  const existing = await prisma.submission.findUnique({
    where: {
      studentId_assignmentId: {
        studentId: session.user.id,
        assignmentId,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "이미 제출한 과제입니다." },
      { status: 409 }
    );
  }

  // Get questions for grading
  const questions = await prisma.question.findMany({
    where: { assignmentId },
    orderBy: { questionNumber: "asc" },
  });

  if (questions.length === 0) {
    return NextResponse.json(
      { error: "과제를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Auto-grade
  const result = gradeSubmission(questions, answers);

  // Save submission with grading results
  const submission = await prisma.submission.create({
    data: {
      studentId: session.user.id,
      assignmentId,
      score: result.score,
      totalPoints: result.totalPoints,
      gradedAt: new Date(),
      answers: {
        create: result.details.map((d) => ({
          questionNumber: d.questionNumber,
          studentAnswer: d.studentAnswer,
          isCorrect: d.isCorrect,
        })),
      },
    },
    include: { answers: true },
  });

  return NextResponse.json(submission, { status: 201 });
}
