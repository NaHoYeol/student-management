import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeAnalysis, computeGradeCutoffs, computeSubmissionWeights } from "@/lib/statistics";
import { parseStoredExamData, sectionsToMarkdown } from "@/lib/exam-parser";
import { isAdmin } from "@/lib/role-check";

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

  if (assignment.submissions.length === 0) {
    return NextResponse.json({ error: "No submissions" }, { status: 400 });
  }

  const realSubmissions = assignment.submissions.filter((s) => !s.isAgent);
  const agentSubmissions = assignment.submissions.filter((s) => s.isAgent);
  const agentOnly = !isStudent && realSubmissions.length === 0;

  // 실제 학생 데이터에 가중치를 높여 시뮬레이션 보정
  const { realWeight, agentWeight } = computeSubmissionWeights(
    realSubmissions.length,
    agentSubmissions.length
  );

  const totalPoints =
    assignment.questions.reduce((s, q) => s + q.points, 0);

  const questionInputs = assignment.questions.map((q) => ({
    questionNumber: q.questionNumber,
    correctAnswer: q.correctAnswer,
    questionType: q.questionType,
  }));

  const analysis = computeAnalysis(
    questionInputs,
    assignment.submissions.map((s) => ({
      score: s.score ?? 0,
      weight: s.isAgent ? agentWeight : realWeight,
      answers: s.answers.map((a) => ({
        questionNumber: a.questionNumber,
        studentAnswer: String(a.studentAnswer),
        isCorrect: a.isCorrect,
      })),
    })),
    totalPoints
  );

  // 등급컷 산출 (전체 데이터 기반)
  const allScores = assignment.submissions.map((s) => s.score ?? 0);
  analysis.gradeCutoffs = computeGradeCutoffs(allScores, totalPoints);

  let examMarkdown: string | null = null;
  if (assignment.examContent) {
    const examData = parseStoredExamData(assignment.examContent);
    if (examData && examData.sections.length > 0) {
      examMarkdown = sectionsToMarkdown(examData.sections);
    }
  }

  return NextResponse.json({
    title: assignment.title,
    analysisPublished: assignment.analysisPublished,
    analysis,
    isStudent,
    agentOnly: agentOnly ?? false,
    realStudentCount: realSubmissions.length,
    examMarkdown,
  });
}

// PUT: Toggle publish status (Admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
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
