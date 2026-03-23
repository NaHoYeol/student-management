import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMonthlyFeedback, type WeeklyAssignment, type QuestionLookupFn } from "@/lib/gpt-feedback";
import { parseStoredExamData, extractQuestionsByNumbers, type ExamSection } from "@/lib/exam-parser";
import { computeSubmissionWeights } from "@/lib/statistics";
import { isAdmin } from "@/lib/role-check";

// GET: 월 목록 + 각 월의 대상 학생 수 + 상태
export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. 마감일이 있는 모든 활성 과제
  const assignments = await prisma.assignment.findMany({
    where: { isActive: true, dueDate: { not: null } },
    select: { id: true, dueDate: true },
  });

  // 2. 월별 과제 그룹핑
  const monthAssignments = new Map<string, string[]>(); // month -> assignmentIds
  for (const a of assignments) {
    if (!a.dueDate) continue;
    const key = `${a.dueDate.getFullYear()}-${String(a.dueDate.getMonth() + 1).padStart(2, "0")}`;
    if (!monthAssignments.has(key)) monthAssignments.set(key, []);
    monthAssignments.get(key)!.push(a.id);
  }

  // 3. 각 월별 대상 학생 수 계산 (마감일이 다른 과제를 2회 이상 제출한 학생)
  const months: {
    month: string;
    label: string;
    assignmentCount: number;
    eligibleStudentCount: number;
    status: string;
  }[] = [];

  // DB에 저장된 월별 리포트 상태 조회
  const existingReports = await prisma.monthlyReport.findMany();
  const reportMap = new Map(existingReports.map((r) => [r.month, r]));

  for (const [monthKey, aIds] of Array.from(monthAssignments.entries()).sort()) {
    // 해당 월 과제에 대한 실제 학생 제출 (에이전트 제외)
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: { in: aIds }, isAgent: false },
      select: {
        studentId: true,
        assignment: { select: { dueDate: true } },
      },
    });

    // 학생별로 마감일이 다른 과제를 몇 개 제출했는지 카운트
    const studentDueDates = new Map<string, Set<string>>();
    for (const s of submissions) {
      if (!s.assignment.dueDate) continue;
      const dueDateStr = s.assignment.dueDate.toISOString().split("T")[0];
      if (!studentDueDates.has(s.studentId)) studentDueDates.set(s.studentId, new Set());
      studentDueDates.get(s.studentId)!.add(dueDateStr);
    }

    let eligibleCount = 0;
    for (const dueDates of studentDueDates.values()) {
      if (dueDates.size >= 2) eligibleCount++;
    }

    const [year, month] = monthKey.split("-");
    const report = reportMap.get(monthKey);

    months.push({
      month: monthKey,
      label: `${year}년 ${parseInt(month)}월`,
      assignmentCount: aIds.length,
      eligibleStudentCount: eligibleCount,
      status: report?.status ?? "PENDING",
    });
  }

  return NextResponse.json(months);
}

// POST: 분석 시작 또는 게시
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { month, action } = body as { month: string; action: "analyze" | "publish" };

  if (!month || !action) {
    return NextResponse.json({ error: "month and action required" }, { status: 400 });
  }

  if (action === "publish") {
    // 게시
    const report = await prisma.monthlyReport.findUnique({ where: { month } });
    if (!report || report.status !== "ANALYZED") {
      return NextResponse.json({ error: "분석이 완료되지 않았습니다." }, { status: 400 });
    }
    const updated = await prisma.monthlyReport.update({
      where: { month },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return NextResponse.json({ status: updated.status });
  }

  // action === "analyze"
  // 1. 해당 월의 과제 목록
  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1);
  const endDate = new Date(year, mon, 1);

  const assignments = await prisma.assignment.findMany({
    where: {
      isActive: true,
      dueDate: { gte: startDate, lt: endDate },
    },
    select: {
      id: true, title: true, dueDate: true, category: true,
      totalQuestions: true, examContent: true,
      questions: { orderBy: { questionNumber: "asc" }, select: { questionNumber: true, correctAnswer: true, points: true } },
    },
  });

  const assignmentIds = assignments.map((a) => a.id);
  if (assignmentIds.length === 0) {
    return NextResponse.json({ error: "해당 월에 과제가 없습니다." }, { status: 400 });
  }

  // 시험지 구조화 데이터 캐시 (전체 마크다운이 아닌 sections 구조 → 관련 문항만 추출용)
  const examSectionsMap = new Map<string, ExamSection[] | null>();
  for (const a of assignments) {
    if (a.examContent) {
      const examData = parseStoredExamData(a.examContent);
      examSectionsMap.set(a.id, examData && examData.sections.length > 0 ? examData.sections : null);
    } else {
      examSectionsMap.set(a.id, null);
    }
  }

  // 정답 맵
  const correctAnswerMap = new Map<string, Map<number, { answer: string; points: number }>>();
  for (const a of assignments) {
    const qMap = new Map<number, { answer: string; points: number }>();
    for (const q of a.questions) qMap.set(q.questionNumber, { answer: q.correctAnswer, points: q.points });
    correctAnswerMap.set(a.id, qMap);
  }

  // 2. 모든 제출 (에이전트 제외)
  const submissions = await prisma.submission.findMany({
    where: { assignmentId: { in: assignmentIds }, isAgent: false },
    include: {
      assignment: { select: { id: true, title: true, dueDate: true, category: true, totalQuestions: true } },
      answers: { orderBy: { questionNumber: "asc" } },
      student: { select: { id: true, name: true, email: true } },
    },
  });

  // 3. 학생별 그룹핑 + 대상 학생 필터
  const studentSubs = new Map<string, typeof submissions>();
  for (const s of submissions) {
    if (!studentSubs.has(s.studentId)) studentSubs.set(s.studentId, []);
    studentSubs.get(s.studentId)!.push(s);
  }

  const eligibleStudentIds: string[] = [];
  for (const [studentId, subs] of studentSubs) {
    const dueDates = new Set(subs.map((s) => s.assignment.dueDate?.toISOString().split("T")[0]).filter(Boolean));
    if (dueDates.size >= 2) eligibleStudentIds.push(studentId);
  }

  // 4. 캐시된 분석 결과 조회
  const analysisResults = await prisma.studentAnalysisResult.findMany({
    where: { assignmentId: { in: assignmentIds }, studentId: { in: eligibleStudentIds } },
  });
  const analysisMap = new Map(analysisResults.map((r) => [`${r.studentId}:${r.assignmentId}`, r]));

  // 5. 문항별 전체 정답률 (난이도 분류용)
  const allSubmissionsForStats = await prisma.submission.findMany({
    where: { assignmentId: { in: assignmentIds } },
    include: { answers: true },
  });

  const questionCorrectRates = new Map<string, number>();
  for (const aId of assignmentIds) {
    const subs = allSubmissionsForStats.filter((s) => s.assignmentId === aId);
    const realCount = subs.filter((s) => !s.isAgent).length;
    const agentCount = subs.filter((s) => s.isAgent).length;
    const { realWeight, agentWeight } = computeSubmissionWeights(realCount, agentCount);

    const questionNumbers = new Set<number>();
    for (const sub of subs) {
      for (const ans of sub.answers) questionNumbers.add(ans.questionNumber);
    }
    for (const qn of questionNumbers) {
      let correctW = 0, totalW = 0;
      for (const sub of subs) {
        const w = sub.isAgent ? agentWeight : realWeight;
        const ans = sub.answers.find((a) => a.questionNumber === qn);
        if (ans) { totalW += w; if (ans.isCorrect) correctW += w; }
      }
      questionCorrectRates.set(`${aId}:${qn}`, totalW > 0 ? (correctW / totalW) * 100 : 0);
    }
  }

  // 6. 이전 월 데이터 조회 (추이 계산용)
  const prevMonthKey = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
  const prevReport = await prisma.monthlyReport.findUnique({
    where: { month: prevMonthKey },
    include: { students: true },
  });
  const prevStudentData = new Map<string, { avgCorrectRate: number; avgGrade: number | null }>();
  if (prevReport) {
    for (const ps of prevReport.students) {
      const d = ps.analysisData as { avgCorrectRate: number; avgGrade: number | null };
      prevStudentData.set(ps.studentId, d);
    }
  }

  // 7. 학생별 분석 데이터 생성 (주차별 시계열 + AI 분석) — 병렬 처리
  const monthLabel = `${year}년 ${mon}월`;

  // 단일 학생 분석 함수
  async function analyzeStudent(studentId: string) {
    const subs = studentSubs.get(studentId)!;
    const studentInfo = subs[0].student;

    // 주차별 그룹핑 (같은 마감일 = 같은 주차)
    const dueDateGroups = new Map<string, typeof subs>();
    for (const sub of subs) {
      const dd = sub.assignment.dueDate?.toISOString().split("T")[0] ?? "unknown";
      if (!dueDateGroups.has(dd)) dueDateGroups.set(dd, []);
      dueDateGroups.get(dd)!.push(sub);
    }
    const sortedDueDates = Array.from(dueDateGroups.keys()).sort();

    // 주차별 데이터 생성
    const weeklyData: { weekLabel: string; dueDate: string; assignments: WeeklyAssignment[] }[] = [];

    for (let wi = 0; wi < sortedDueDates.length; wi++) {
      const dd = sortedDueDates[wi];
      const weekSubs = dueDateGroups.get(dd)!;
      const ddDate = new Date(dd);
      const weekLabel = `${wi + 1}주차 (${ddDate.getMonth() + 1}/${ddDate.getDate()})`;

      const weekAssignments: WeeklyAssignment[] = weekSubs.map((sub) => {
        const score = sub.score ?? 0;
        const totalPoints = sub.totalPoints ?? 0;
        const correctRate = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
        const analysis = analysisMap.get(`${studentId}:${sub.assignmentId}`);
        const qMap = correctAnswerMap.get(sub.assignmentId);

        // 틀린 문항 상세
        const wrongQuestions = sub.answers
          .filter((a) => !a.isCorrect)
          .map((a) => ({
            questionNumber: a.questionNumber,
            studentAnswer: a.studentAnswer,
            correctAnswer: qMap?.get(a.questionNumber)?.answer ?? "?",
            correctRate: questionCorrectRates.get(`${sub.assignmentId}:${a.questionNumber}`) ?? 0,
          }));

        // 맞힌 문항 (정답률 포함)
        const correctQuestions = sub.answers
          .filter((a) => a.isCorrect)
          .map((a) => ({
            questionNumber: a.questionNumber,
            correctRate: questionCorrectRates.get(`${sub.assignmentId}:${a.questionNumber}`) ?? 0,
          }));

        return {
          title: sub.assignment.title,
          dueDate: dd,
          correctRate,
          score,
          totalPoints,
          grade: analysis?.grade ?? null,
          wrongQuestions,
          correctQuestions,
        };
      });

      weeklyData.push({ weekLabel, dueDate: dd, assignments: weekAssignments });
    }

    // 전체 통계
    const allEntries = subs.map((sub) => {
      const score = sub.score ?? 0;
      const totalPoints = sub.totalPoints ?? 0;
      const correctRate = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
      const analysis = analysisMap.get(`${studentId}:${sub.assignmentId}`);
      const diff = { hard: { t: 0, c: 0 }, mid: { t: 0, c: 0 }, easy: { t: 0, c: 0 } };
      for (const ans of sub.answers) {
        const qcr = questionCorrectRates.get(`${sub.assignmentId}:${ans.questionNumber}`) ?? 50;
        const tier = qcr < 40 ? "hard" : qcr < 70 ? "mid" : "easy";
        diff[tier].t++;
        if (ans.isCorrect) diff[tier].c++;
      }
      return {
        title: sub.assignment.title,
        category: sub.assignment.category,
        correctRate,
        grade: analysis?.grade ?? null,
        percentile: analysis?.percentile ?? null,
        difficultyBreakdown: diff,
      };
    });

    const avgCorrectRate = Math.round(allEntries.reduce((s, e) => s + e.correctRate, 0) / allEntries.length);
    const gradesAvail = allEntries.filter((e) => e.grade !== null);
    const avgGrade = gradesAvail.length > 0
      ? Math.round(gradesAvail.reduce((s, e) => s + e.grade!, 0) / gradesAvail.length * 10) / 10
      : null;
    const percAvail = allEntries.filter((e) => e.percentile !== null);
    const avgPercentile = percAvail.length > 0
      ? Math.round(percAvail.reduce((s, e) => s + e.percentile!, 0) / percAvail.length * 10) / 10
      : null;

    const sorted = [...allEntries].sort((a, b) => b.correctRate - a.correctRate);
    const best = sorted[0];
    const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;

    const diffTotals = { hard: { t: 0, c: 0 }, mid: { t: 0, c: 0 }, easy: { t: 0, c: 0 } };
    for (const e of allEntries) {
      diffTotals.hard.t += e.difficultyBreakdown.hard.t;
      diffTotals.hard.c += e.difficultyBreakdown.hard.c;
      diffTotals.mid.t += e.difficultyBreakdown.mid.t;
      diffTotals.mid.c += e.difficultyBreakdown.mid.c;
      diffTotals.easy.t += e.difficultyBreakdown.easy.t;
      diffTotals.easy.c += e.difficultyBreakdown.easy.c;
    }
    const difficultyRates = {
      hard: diffTotals.hard.t > 0 ? Math.round((diffTotals.hard.c / diffTotals.hard.t) * 100) : null,
      mid: diffTotals.mid.t > 0 ? Math.round((diffTotals.mid.c / diffTotals.mid.t) * 100) : null,
      easy: diffTotals.easy.t > 0 ? Math.round((diffTotals.easy.c / diffTotals.easy.t) * 100) : null,
    };

    const prev = prevStudentData.get(studentId);
    const trend = {
      correctRate: prev ? avgCorrectRate - prev.avgCorrectRate : null,
      grade: prev && avgGrade !== null && prev.avgGrade !== null
        ? Math.round((avgGrade - prev.avgGrade) * 10) / 10
        : null,
    };

    // 주차별 시계열 데이터 (그래프용)
    const weeklyTimeline = weeklyData.map((w) => ({
      weekLabel: w.weekLabel,
      dueDate: w.dueDate,
      avgCorrectRate: Math.round(w.assignments.reduce((s, a) => s + a.correctRate, 0) / w.assignments.length),
      avgGrade: (() => {
        const grades = w.assignments.filter((a) => a.grade !== null).map((a) => a.grade!);
        return grades.length > 0 ? Math.round(grades.reduce((s, g) => s + g, 0) / grades.length * 10) / 10 : null;
      })(),
      assignments: w.assignments.map((a) => ({
        title: a.title,
        correctRate: a.correctRate,
        score: a.score,
        totalPoints: a.totalPoints,
        grade: a.grade,
        wrongCount: a.wrongQuestions.length,
        wrongQuestions: a.wrongQuestions,
        correctHighlights: a.correctQuestions.filter((q) => q.correctRate < 55),
      })),
    }));

    // RAG: questionLookup 함수 (GPT가 tool call로 문항 내용 조회)
    const titleToIdMap = new Map<string, string>();
    for (const a of assignments) titleToIdMap.set(a.title, a.id);

    const questionLookup: QuestionLookupFn = (assignmentTitle, questionNumbers) => {
      const aId = titleToIdMap.get(assignmentTitle);
      if (!aId) return null;
      const sections = examSectionsMap.get(aId);
      if (!sections) return null;
      return extractQuestionsByNumbers(sections, questionNumbers) || null;
    };

    // AI 피드백 생성
    let aiFeedback = "";
    try {
      aiFeedback = await generateMonthlyFeedback({
        studentName: studentInfo.name || studentInfo.email,
        monthLabel,
        weeklyData: weeklyData.map((w) => ({
          weekLabel: w.weekLabel,
          assignments: w.assignments,
        })),
        overallCorrectRate: avgCorrectRate,
        overallGrade: avgGrade,
        trend,
        questionLookup,
      }, session!.user.id);
    } catch {
      aiFeedback = `${monthLabel} 분석: 평균 정답률 ${avgCorrectRate}%, ${weeklyData.length}주차 분석 완료.`;
    }

    return {
      studentId,
      studentName: studentInfo.name || studentInfo.email,
      analysisData: {
        avgCorrectRate,
        avgGrade,
        avgPercentile,
        assignmentCount: allEntries.length,
        bestAssignment: best ? { title: best.title, correctRate: best.correctRate } : null,
        worstAssignment: worst ? { title: worst.title, correctRate: worst.correctRate } : null,
        difficultyRates,
        trend,
        weeklyTimeline,
        aiFeedback,
        assignments: allEntries.map((e) => ({
          title: e.title,
          category: e.category,
          correctRate: e.correctRate,
          grade: e.grade,
          percentile: e.percentile,
        })),
      },
    };
  }

  // 병렬 처리: 동시에 최대 3명씩 분석 (OpenAI API rate limit 고려)
  const CONCURRENCY = 3;
  const studentResults: { studentId: string; studentName: string; analysisData: object }[] = [];

  for (let i = 0; i < eligibleStudentIds.length; i += CONCURRENCY) {
    const batch = eligibleStudentIds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((id) => analyzeStudent(id)));
    studentResults.push(...batchResults);
  }

  // 8. DB 저장 (upsert)
  const report = await prisma.monthlyReport.upsert({
    where: { month },
    create: { month, status: "ANALYZED", analyzedAt: new Date() },
    update: { status: "ANALYZED", analyzedAt: new Date() },
  });

  await prisma.monthlyReportStudent.deleteMany({ where: { monthlyReportId: report.id } });
  if (studentResults.length > 0) {
    await prisma.monthlyReportStudent.createMany({
      data: studentResults.map((r) => ({
        monthlyReportId: report.id,
        studentId: r.studentId,
        studentName: r.studentName,
        analysisData: r.analysisData,
      })),
    });
  }

  return NextResponse.json({
    status: "ANALYZED",
    studentCount: studentResults.length,
  });
}
