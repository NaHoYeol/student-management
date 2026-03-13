import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeAnalysis } from "@/lib/statistics";

// GET: Get analysis for an assignment
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isStudent = session.user.role === "STUDENT";

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { questionNumber: "asc" } },
      submissions: {
        // Students see all submissions (agents + real) for full distribution
        // Admin sees only real submissions
        where: isStudent ? {} : { isAgent: false },
        include: {
          answers: { orderBy: { questionNumber: "asc" } },
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Students can only see published analysis
  if (isStudent && !assignment.analysisPublished) {
    return NextResponse.json({ error: "Not published" }, { status: 403 });
  }

  if (assignment.submissions.length === 0) {
    return NextResponse.json({ error: "No submissions" }, { status: 400 });
  }

  const totalPoints =
    assignment.questions.reduce((s, q) => s + q.points, 0);

  const analysis = computeAnalysis(
    assignment.questions.map((q) => ({
      questionNumber: q.questionNumber,
      correctAnswer: q.correctAnswer,
    })),
    assignment.submissions.map((s) => ({
      score: s.score ?? 0,
      answers: s.answers.map((a) => ({
        questionNumber: a.questionNumber,
        studentAnswer: a.studentAnswer,
        isCorrect: a.isCorrect,
      })),
    })),
    totalPoints
  );

  return NextResponse.json({
    title: assignment.title,
    analysisPublished: assignment.analysisPublished,
    analysis,
    isStudent,
  });
}

// PUT: Toggle publish status (Admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { published } = (await req.json()) as { published: boolean };

  await prisma.assignment.update({
    where: { id },
    data: { analysisPublished: published },
  });

  return NextResponse.json({ success: true, published });
}
