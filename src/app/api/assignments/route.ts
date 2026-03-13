import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List all assignments (filtered for students based on targeting)
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

  // For students, filter based on targeting
  if (session.user.role === "STUDENT") {
    const student = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, school: true, grade: true, classDay: true, classTime: true, instructorId: true },
    });

    if (!student) {
      return NextResponse.json([]);
    }

    const studentClassLabel = [
      student.school,
      student.grade,
      student.classDay ? `${student.classDay}요일` : null,
      student.classTime,
    ].filter(Boolean).join(" / ") || "미배정";

    const filtered = assignments.filter((a) => {
      const targetType = a.targetType || "ALL";

      if (targetType === "ALL") return true;

      if (targetType === "CLASS") {
        try {
          const targetClasses: string[] = JSON.parse(a.targetClasses || "[]");
          return targetClasses.includes(studentClassLabel);
        } catch {
          return true;
        }
      }

      if (targetType === "INDIVIDUAL") {
        try {
          const targetIds: string[] = JSON.parse(a.targetStudentIds || "[]");
          return targetIds.includes(student.id);
        } catch {
          return true;
        }
      }

      return true;
    });

    return NextResponse.json(filtered);
  }

  return NextResponse.json(assignments);
}

// POST: Create new assignment (Admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, questions, targetType, targetClasses, targetStudentIds } = body as {
    title: string;
    description?: string;
    questions: { questionNumber: number; correctAnswer: number; points?: number }[];
    targetType?: string;
    targetClasses?: string[];
    targetStudentIds?: string[];
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
      targetType: targetType || "ALL",
      targetClasses: targetClasses ? JSON.stringify(targetClasses) : null,
      targetStudentIds: targetStudentIds ? JSON.stringify(targetStudentIds) : null,
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
