import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Get assignments and scores for a linked child
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
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

  // Get student's submissions with assignment info
  const submissions = await prisma.submission.findMany({
    where: { studentId, isAgent: false },
    include: {
      assignment: {
        select: {
          id: true,
          title: true,
          description: true,
          totalQuestions: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  const result = submissions.map((s) => ({
    assignmentId: s.assignment.id,
    title: s.assignment.title,
    description: s.assignment.description,
    totalQuestions: s.assignment.totalQuestions,
    createdAt: s.assignment.createdAt,
    instructorName: s.assignment.createdBy.name,
    score: s.score,
    totalPoints: s.totalPoints,
    submittedAt: s.submittedAt,
  }));

  return NextResponse.json(result);
}
