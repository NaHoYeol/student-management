import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List all assignments
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assignments = await prisma.assignment.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { questions: true, submissions: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assignments);
}

// POST: Create new assignment (Admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, questions } = body as {
    title: string;
    description?: string;
    questions: { questionNumber: number; correctAnswer: number; points?: number }[];
  };

  if (!title || !questions || questions.length === 0) {
    return NextResponse.json({ error: "제목과 문항 정보는 필수입니다." }, { status: 400 });
  }

  const assignment = await prisma.assignment.create({
    data: {
      title,
      description,
      totalQuestions: questions.length,
      createdById: session.user.id,
      questions: {
        create: questions.map((q) => ({
          questionNumber: q.questionNumber,
          correctAnswer: q.correctAnswer,
          points: q.points ?? 1,
        })),
      },
    },
    include: { questions: true },
  });

  return NextResponse.json(assignment, { status: 201 });
}
