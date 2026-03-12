import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  await prisma.assignment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
