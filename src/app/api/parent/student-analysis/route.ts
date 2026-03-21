import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Get cached analysis result for a linked child
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const assignmentId = url.searchParams.get("assignmentId");
  const studentId = url.searchParams.get("studentId");

  if (!assignmentId || !studentId) {
    return NextResponse.json({ error: "assignmentId and studentId required" }, { status: 400 });
  }

  // Verify approved parent link
  const link = await prisma.parentLink.findUnique({
    where: {
      parentId_studentId: {
        parentId: session.user.id,
        studentId,
      },
    },
  });

  if (!link || link.status !== "APPROVED") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get cached analysis result
  const saved = await prisma.studentAnalysisResult.findUnique({
    where: {
      studentId_assignmentId: {
        studentId,
        assignmentId,
      },
    },
  });

  if (!saved) {
    return NextResponse.json({ error: "분석 결과가 아직 생성되지 않았습니다." }, { status: 404 });
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { title: true },
  });

  return NextResponse.json({
    title: assignment?.title || "",
    score: saved.score,
    totalPoints: saved.totalPoints,
    correctRate: saved.correctRate,
    grade: saved.grade,
    rank: saved.rank,
    totalStudents: saved.totalStudents,
    percentile: saved.percentile,
    wrongQuestions: JSON.parse(saved.wrongQuestions || "[]"),
    weakPattern: saved.weakPattern || "",
    feedback: saved.feedback || "",
    questionBreakdown: JSON.parse(saved.questionBreakdown || "[]"),
    hasAgents: true,
    cached: true,
  });
}
