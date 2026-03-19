import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeAnalysis, computeGradeCutoffs } from "@/lib/statistics";

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

  // Admin: prefer real students, fall back to all (including agents) if none
  // Student: all submissions for distribution context
  const realSubmissions = assignment.submissions.filter((s) => !s.isAgent);
  const statsSubmissions = isStudent
    ? assignment.submissions
    : realSubmissions.length > 0 ? realSubmissions : assignment.submissions;

  if (statsSubmissions.length === 0) {
    return NextResponse.json({ error: "No submissions" }, { status: 400 });
  }

  const agentOnly = !isStudent && realSubmissions.length === 0;

  const totalPoints =
    assignment.questions.reduce((s, q) => s + q.points, 0);

  const questionInputs = assignment.questions.map((q) => ({
    questionNumber: q.questionNumber,
    correctAnswer: q.correctAnswer,
    questionType: q.questionType,
  }));

  const analysis = computeAnalysis(
    questionInputs,
    statsSubmissions.map((s) => ({
      score: s.score ?? 0,
      answers: s.answers.map((a) => ({
        questionNumber: a.questionNumber,
        studentAnswer: String(a.studentAnswer),
        isCorrect: a.isCorrect,
      })),
    })),
    totalPoints
  );

  // 에이전트 포함 전체 점수로 등급컷 산출 (관리자용)
  const agentSubmissions = assignment.submissions.filter((s) => s.isAgent);
  if (!isStudent && agentSubmissions.length > 0) {
    const allScores = assignment.submissions.map((s) => s.score ?? 0);
    analysis.gradeCutoffs = computeGradeCutoffs(allScores, totalPoints);
  }
  // 학생용: 에이전트 포함 데이터로 등급컷 산출
  if (isStudent && agentSubmissions.length > 0) {
    const allScores = assignment.submissions.map((s) => s.score ?? 0);
    analysis.gradeCutoffs = computeGradeCutoffs(allScores, totalPoints);
  }

  return NextResponse.json({
    title: assignment.title,
    analysisPublished: assignment.analysisPublished,
    analysis,
    isStudent,
    agentOnly: agentOnly ?? false,
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
