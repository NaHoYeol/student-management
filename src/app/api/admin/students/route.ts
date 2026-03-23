import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/role-check";

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      NOT: { email: { endsWith: "@internal" } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      school: true,
      grade: true,
      classDay: true,
      classTime: true,
      _count: { select: { submissions: { where: { isAgent: false } } } },
      submissions: {
        where: { isAgent: false },
        select: { score: true, totalPoints: true },
      },
    },
    orderBy: [{ school: "asc" }, { grade: "asc" }, { classDay: "asc" }, { classTime: "asc" }, { name: "asc" }],
  });

  const result = students.map((s) => {
    const avgScore =
      s.submissions.length > 0
        ? Math.round(
            s.submissions.reduce((sum, sub) => sum + (sub.score ?? 0), 0) /
              s.submissions.length
          )
        : null;
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      school: s.school,
      grade: s.grade,
      classDay: s.classDay,
      classTime: s.classTime,
      submissionCount: s._count.submissions,
      avgScore,
    };
  });

  return NextResponse.json(result);
}
