import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: 학생 자신의 게시된 월별 성취도 목록
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const studentId = session.user.id;

  // 게시된 리포트 중 이 학생의 데이터가 있는 것만
  const reports = await prisma.monthlyReport.findMany({
    where: { status: "PUBLISHED" },
    include: {
      students: {
        where: { studentId },
      },
    },
    orderBy: { month: "desc" },
  });

  const results = reports
    .filter((r) => r.students.length > 0)
    .map((r) => {
      const [year, mon] = r.month.split("-");
      return {
        month: r.month,
        label: `${year}년 ${parseInt(mon)}월`,
        publishedAt: r.publishedAt,
        analysis: r.students[0].analysisData,
      };
    });

  return NextResponse.json(results);
}
