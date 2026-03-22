import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: 특정 월의 대상 학생 목록 + 분석 결과
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { month } = await params;
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const startDate = new Date(year, mon - 1, 1);
  const endDate = new Date(year, mon, 1);

  // 1. 해당 월 과제
  const assignments = await prisma.assignment.findMany({
    where: { isActive: true, dueDate: { gte: startDate, lt: endDate } },
    select: { id: true, title: true, dueDate: true },
  });
  const assignmentIds = assignments.map((a) => a.id);

  // 2. 실제 제출 (에이전트 제외)
  const submissions = await prisma.submission.findMany({
    where: { assignmentId: { in: assignmentIds }, isAgent: false },
    select: {
      studentId: true,
      assignment: { select: { dueDate: true } },
      student: { select: { id: true, name: true, email: true, school: true, grade: true } },
    },
  });

  // 3. 대상 학생 필터 (마감일이 다른 과제 2회 이상)
  const studentDueDates = new Map<string, { dueDates: Set<string>; info: typeof submissions[0]["student"] }>();
  for (const s of submissions) {
    if (!s.assignment.dueDate) continue;
    const dueDateStr = s.assignment.dueDate.toISOString().split("T")[0];
    if (!studentDueDates.has(s.studentId)) {
      studentDueDates.set(s.studentId, { dueDates: new Set(), info: s.student });
    }
    studentDueDates.get(s.studentId)!.dueDates.add(dueDateStr);
  }

  const eligibleStudents: {
    id: string;
    name: string;
    school: string | null;
    grade: string | null;
    submissionCount: number;
  }[] = [];

  for (const [, data] of studentDueDates) {
    if (data.dueDates.size >= 2) {
      eligibleStudents.push({
        id: data.info.id,
        name: data.info.name || data.info.email,
        school: data.info.school,
        grade: data.info.grade,
        submissionCount: data.dueDates.size,
      });
    }
  }

  // 4. 저장된 분석 결과
  const report = await prisma.monthlyReport.findUnique({
    where: { month },
    include: { students: true },
  });

  const analysisMap = new Map<string, object>();
  if (report) {
    for (const rs of report.students) {
      analysisMap.set(rs.studentId, rs.analysisData as object);
    }
  }

  const studentsWithAnalysis = eligibleStudents.map((s) => ({
    ...s,
    analysis: analysisMap.get(s.id) ?? null,
  }));

  return NextResponse.json({
    month,
    label: `${year}년 ${mon}월`,
    assignmentCount: assignments.length,
    assignments: assignments.map((a) => ({ id: a.id, title: a.title })),
    status: report?.status ?? "PENDING",
    students: studentsWithAnalysis,
  });
}
