import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gradeSubmission } from "@/lib/grading";

// PUT: Update submission answers and re-grade
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { answers: true },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (submission.studentId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { answers } = body as {
    answers: { questionNumber: number; studentAnswer: number }[];
  };

  // Get questions for re-grading
  const questions = await prisma.question.findMany({
    where: { assignmentId: submission.assignmentId },
    orderBy: { questionNumber: "asc" },
  });

  const result = gradeSubmission(questions, answers);

  // Delete old answers and create new ones, update score
  await prisma.$transaction([
    prisma.submissionAnswer.deleteMany({ where: { submissionId: id } }),
    prisma.submission.update({
      where: { id },
      data: {
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
    }),
  ]);

  const updated = await prisma.submission.findUnique({
    where: { id },
    include: { answers: { orderBy: { questionNumber: "asc" } } },
  });

  return NextResponse.json(updated);
}
