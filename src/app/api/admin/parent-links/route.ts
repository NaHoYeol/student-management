import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List parent link requests for the instructor's students
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all students of this instructor
  const studentIds = await prisma.user.findMany({
    where: { instructorId: session.user.id, role: "STUDENT" },
    select: { id: true },
  });

  const ids = studentIds.map((s) => s.id);

  const links = await prisma.parentLink.findMany({
    where: { studentId: { in: ids } },
    include: {
      parent: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true, school: true, grade: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(links);
}
