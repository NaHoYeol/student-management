import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gradeSubmission } from "@/lib/grading";
import { parseStoredExamData, sectionsToMarkdown } from "@/lib/exam-parser";

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
    let examMarkdown: string | null = null;
    if (assignment.examContent) {
      const examData = parseStoredExamData(assignment.examContent);
      if (examData && examData.sections.length > 0) {
        examMarkdown = sectionsToMarkdown(examData.sections);
      }
    }

    const sanitized = {
      ...assignment,
      examContent: undefined,
      examMarkdown,
      questions: assignment.questions.map((q) => ({
        id: q.id,
        questionNumber: q.questionNumber,
        questionType: q.questionType,
        points: q.points,
      })),
    };
    return NextResponse.json(sanitized);
  }

  return NextResponse.json(assignment);
}

// PUT: Update assignment info and/or answers, re-grade submissions (Admin only)
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
  const { questions, title, description, targetType, targetClasses, targetStudentIds, dueDate, category, examDate } = body as {
    questions?: { questionNumber: number; correctAnswer: string; questionType?: string; points?: number }[];
    title?: string;
    description?: string;
    targetType?: string;
    targetClasses?: string[];
    targetStudentIds?: string[];
    dueDate?: string | null;
    category?: string;
    examDate?: string | null;
  };

  // Update assignment info (title, description, target) if provided
  const infoUpdate: Record<string, unknown> = {};
  if (title !== undefined) infoUpdate.title = title;
  if (description !== undefined) infoUpdate.description = description;
  if (dueDate !== undefined) infoUpdate.dueDate = dueDate ? new Date(dueDate) : null;
  if (category !== undefined) infoUpdate.category = category;
  if (examDate !== undefined) infoUpdate.examDate = examDate ? new Date(examDate) : null;
  if (targetType !== undefined) {
    infoUpdate.targetType = targetType;
    if (targetType === "CLASS") {
      infoUpdate.targetClasses = JSON.stringify(targetClasses || []);
      infoUpdate.targetStudentIds = null;
    } else if (targetType === "INDIVIDUAL") {
      infoUpdate.targetStudentIds = JSON.stringify(targetStudentIds || []);
      infoUpdate.targetClasses = null;
    } else {
      infoUpdate.targetClasses = null;
      infoUpdate.targetStudentIds = null;
    }
  }

  // If only info update (no questions change)
  if (!questions || questions.length === 0) {
    if (Object.keys(infoUpdate).length === 0) {
      return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
    }
    const assignment = await prisma.assignment.update({
      where: { id },
      data: infoUpdate,
      include: { questions: { orderBy: { questionNumber: "asc" } } },
    });
    return NextResponse.json(assignment);
  }

  // Update questions: delete old ones and create new ones
  await prisma.$transaction([
    prisma.question.deleteMany({ where: { assignmentId: id } }),
    prisma.assignment.update({
      where: { id },
      data: {
        ...infoUpdate,
        totalQuestions: questions.length,
        questions: {
          create: questions.map((q) => ({
            questionNumber: q.questionNumber,
            correctAnswer: String(q.correctAnswer),
            questionType: q.questionType || "choice",
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
      studentAnswer: String(a.studentAnswer),
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
