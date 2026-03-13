import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gradeSubmission } from "@/lib/grading";

// GET: Get single assignment details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { questionNumber: "asc" } },
      _count: { select: { submissions: true } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Students should not see correct answers
  if (session.user.role === "STUDENT") {
    const sanitized = {
      ...assignment,
      questions: assignment.questions.map((q) => ({
        id: q.id,
        questionNumber: q.questionNumber,
        points: q.points,
      })),
    };
    return NextResponse.json(sanitized);
  }

  return NextResponse.json(assignment);
}

// PUT: Update assignment answers and re-grade submissions (Admin only)
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
  const { questions } = body as {
    questions: { questionNumber: number; correctAnswer: number; points?: number }[];
  };

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: "문항 정보는 필수입니다." }, { status: 400 });
  }

  // Update questions: delete old ones and create new ones
  await prisma.$transaction([
    prisma.question.deleteMany({ where: { assignmentId: id } }),
    prisma.assignment.update({
      where: { id },
      data: {
        totalQuestions: questions.length,
        questions: {
          create: questions.map((q) => ({
            questionNumber: q.questionNumber,
            correctAnswer: q.correctAnswer,
            points: q.points ?? 1,
          })),
        },
      },
    }),
  ]);

  // Re-grade all existing submissions
  const updatedQuestions = await prisma.question.findMany({
    where: { assignmentId: id },
    orderBy: { questionNumber: "asc" },
  });

  const submissions = await prisma.submission.findMany({
    where: { assignmentId: id },
    include: { answers: true },
  });

  for (const sub of submissions) {
    const answers = sub.answers.map((a) => ({
      questionNumber: a.questionNumber,
      studentAnswer: a.studentAnswer,
    }));
    const result = gradeSubmission(updatedQuestions, answers);

    await prisma.$transaction([
      prisma.submissionAnswer.deleteMany({ where: { submissionId: sub.id } }),
      prisma.submission.update({
        where: { id: sub.id },
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
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: { questions: { orderBy: { questionNumber: "asc" } } },
  });

  return NextResponse.json(assignment);
}

// DELETE: Delete assignment (Admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Delete related submissions (and their answers via cascade) first
  await prisma.submission.deleteMany({ where: { assignmentId: id } });
  await prisma.assignment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
