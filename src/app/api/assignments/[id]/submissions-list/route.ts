import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List real student submissions for an assignment (admin only)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: assignmentId } = await params;

  const submissions = await prisma.submission.findMany({
    where: { assignmentId, isAgent: false },
    select: {
      id: true,
      studentId: true,
      score: true,
      totalPoints: true,
      student: { select: { name: true, email: true } },
    },
    orderBy: { score: "desc" },
  });

  const result = submissions.map((s) => ({
    id: s.id,
    studentId: s.studentId,
    studentName: s.student.name,
    studentEmail: s.student.email,
    score: s.score ?? 0,
    totalPoints: s.totalPoints ?? 0,
    correctRate: s.totalPoints ? Math.round(((s.score ?? 0) / s.totalPoints) * 100) : 0,
  }));

  return NextResponse.json(result);
}
