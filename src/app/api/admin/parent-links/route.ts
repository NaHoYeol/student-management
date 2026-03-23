import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List parent link requests (자기 학생에 연결된 것 + 아직 미연결인 것)
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 이 강사의 학생 ID 목록
  const studentIds = await prisma.user.findMany({
    where: { instructorId: session.user.id, role: "STUDENT" },
    select: { id: true },
  });
  const ids = studentIds.map((s) => s.id);

  // 자기 학생에 연결된 요청 + 아직 학생 미연결(studentId가 null)인 요청
  const links = await prisma.parentLink.findMany({
    where: {
      OR: [
        { studentId: { in: ids } },
        { studentId: null },
      ],
    },
    include: {
      parent: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true, school: true, grade: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(links);
}
