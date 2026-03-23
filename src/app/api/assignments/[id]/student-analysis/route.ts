import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateGrade } from "@/lib/agent-simulation";
import { generateFeedback } from "@/lib/gpt-feedback";
import { parseStoredExamData, sectionsToMarkdown } from "@/lib/exam-parser";
import { computeWeightedQuestionRates } from "@/lib/statistics";
import { isAdmin } from "@/lib/role-check";

// GET: Get individual student analysis for an assignment
// Supports ?studentId=xxx for admin to view specific student
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assignmentId } = await params;
  const isAdminRole = isAdmin(session.user.role);

  // Admin can view any student's analysis via ?studentId=xxx
  const url = new URL(req.url);
  const targetStudentId = isAdminRole
    ? url.searchParams.get("studentId") || session.user.id
    : session.user.id;

  try {

  // Get the assignment
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      questions: { orderBy: { questionNumber: "asc" } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Students can always view their own individual analysis (no publish gate)

  // 캐시된 분석 결과 조회 (강사/학생 모두 활용)
  const saved = await prisma.studentAnalysisResult.findUnique({
    where: {
      studentId_assignmentId: {
        studentId: targetStudentId,
        assignmentId,
      },
    },
  });

  if (saved) {
    // 디바운스 캐시 무효화: 마지막 제출 후 2시간이 지났고 캐시가 그 전에 생성된 경우 재계산
    const CACHE_DEBOUNCE_MS = 2 * 60 * 60 * 1000; // 2시간
    const lastSub = assignment.lastRealSubmissionAt;
    const cacheStale = lastSub
      && lastSub > saved.createdAt
      && (Date.now() - lastSub.getTime()) >= CACHE_DEBOUNCE_MS;

    if (!cacheStale) {
      let examMarkdown: string | null = null;
      if (assignment.examContent) {
        const examData = parseStoredExamData(assignment.examContent);
        if (examData && examData.sections.length > 0) {
          examMarkdown = sectionsToMarkdown(examData.sections);
        }
      }

      return NextResponse.json({
        title: assignment.title,
        score: saved.score,
        totalPoints: saved.totalPoints,
        correctRate: saved.correctRate,
        grade: saved.grade,
        rank: saved.rank,
        totalStudents: saved.totalStudents,
        percentile: saved.percentile,
        wrongQuestions: JSON.parse(saved.wrongQuestions || "[]"),
        weakPattern: saved.weakPattern || "",
        feedback: saved.feedback || "",
        questionBreakdown: JSON.parse(saved.questionBreakdown || "[]"),
        hasAgents: true,
        cached: true,
        examMarkdown,
      });
    }
    // 캐시가 만료됨 → 아래에서 재계산
  }

  // Get the student's submission
  const submission = await prisma.submission.findFirst({
    where: {
      assignmentId,
      studentId: targetStudentId,
      isAgent: false,
    },
    include: {
      answers: { orderBy: { questionNumber: "asc" } },
      student: { select: { name: true } },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "No submission" }, { status: 404 });
  }

  // Get ALL submissions (agents + real students) for question-level stats
  const allSubmissions = await prisma.submission.findMany({
    where: { assignmentId },
    include: {
      answers: { orderBy: { questionNumber: "asc" } },
    },
  });

  // Get agent submissions for grade estimation
  const agentSubmissions = allSubmissions.filter((s) => s.isAgent);
  const agentScores = agentSubmissions.map((s) => s.score ?? 0);
  const studentScore = submission.score ?? 0;
  const totalPoints = submission.totalPoints ?? 0;
  const correctRate = totalPoints > 0 ? Math.round((studentScore / totalPoints) * 100) : 0;

  // 가중치 기반 문항별 정답률 (실제 학생 데이터 가중 반영)
  const realSubs = allSubmissions.filter((s) => !s.isAgent);
  const agentSubs = allSubmissions.filter((s) => s.isAgent);
  const questionCorrectRates = computeWeightedQuestionRates(
    assignment.questions,
    allSubmissions.map((s) => ({
      isAgent: s.isAgent,
      answers: s.answers.map((a) => ({ questionNumber: a.questionNumber, isCorrect: a.isCorrect })),
    })),
    realSubs.length,
    agentSubs.length
  );

  // Estimate grade if agents exist
  let gradeInfo = { grade: 0, rank: 0, percentile: 0 };
  if (agentScores.length > 0) {
    gradeInfo = estimateGrade(studentScore, agentScores);
  }

  // Prepare exam content question lookup
  const examQuestionTexts = new Map<number, string>();
  if (assignment.examContent) {
    try {
      const examData = parseStoredExamData(assignment.examContent);
      if (examData && examData.sections.length > 0) {
        for (const section of examData.sections) {
          for (const q of section.questions) {
            let text = q.text || "";
            if (section.passage) {
              text = `[지문] ${section.passage.substring(0, 300)}... [문제] ${text}`;
            }
            if (q.choices && q.choices.length > 0) {
              text += ` [선지] ${q.choices.join(" / ")}`;
            }
            if (text.length > 600) text = text.substring(0, 600) + "...";
            examQuestionTexts.set(q.number, text);
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // Analyze wrong questions with correct rates + 실제 문제 텍스트
  const wrongQuestions = submission.answers
    .filter((a) => !a.isCorrect)
    .map((a) => {
      const q = assignment.questions.find((q) => q.questionNumber === a.questionNumber);
      return {
        questionNumber: a.questionNumber,
        studentAnswer: a.studentAnswer,
        correctAnswer: q?.correctAnswer ?? "",
        correctRate: Math.round(questionCorrectRates.get(a.questionNumber) ?? 0),
        questionText: examQuestionTexts.get(a.questionNumber) || "",
      };
    });

  // Detect weak patterns
  const weakPattern = analyzeWeakPattern(wrongQuestions, assignment.questions.length);

  // 전체 문항 레퍼런스 (AI가 자유롭게 참조)
  const questionReference = assignment.questions.map((q) => {
    const ans = submission.answers.find((a) => a.questionNumber === q.questionNumber);
    return {
      questionNumber: q.questionNumber,
      studentAnswer: ans?.studentAnswer ?? "",
      correctAnswer: q.correctAnswer,
      isCorrect: ans?.isCorrect ?? false,
      correctRate: Math.round(questionCorrectRates.get(q.questionNumber) ?? 0),
      questionText: examQuestionTexts.get(q.questionNumber) || "",
    };
  });

  // Generate AI feedback with full question reference
  const studentName = submission.student?.name || session.user.name || "학생";
  const feedback = await generateFeedback({
    studentName,
    assignmentTitle: assignment.title,
    score: studentScore,
    totalPoints,
    grade: gradeInfo.grade,
    rank: gradeInfo.rank,
    totalStudents: agentScores.length + 1,
    correctRate,
    wrongQuestions,
    weakPattern,
    questionReference,
  }, assignment.createdById);

  // Per-question breakdown with correct rates
  const questionBreakdown = assignment.questions.map((q) => {
    const ans = submission.answers.find((a) => a.questionNumber === q.questionNumber);
    return {
      questionNumber: q.questionNumber,
      correctAnswer: q.correctAnswer,
      studentAnswer: ans?.studentAnswer ?? "",
      isCorrect: ans?.isCorrect ?? false,
      points: q.points,
      correctRate: Math.round(questionCorrectRates.get(q.questionNumber) ?? 0),
    };
  });

  let examMarkdown: string | null = null;
  if (assignment.examContent) {
    const examData = parseStoredExamData(assignment.examContent);
    if (examData && examData.sections.length > 0) {
      examMarkdown = sectionsToMarkdown(examData.sections);
    }
  }

  const result = {
    title: assignment.title,
    score: studentScore,
    totalPoints,
    correctRate,
    grade: gradeInfo.grade,
    rank: gradeInfo.rank,
    totalStudents: agentScores.length + 1,
    percentile: gradeInfo.percentile,
    wrongQuestions,
    weakPattern,
    feedback,
    questionBreakdown,
    hasAgents: agentScores.length > 0,
    examMarkdown,
  };

  // 분석 결과 캐시 저장 (강사/학생 모두)
  if (agentScores.length > 0) {
    try {
      await prisma.studentAnalysisResult.upsert({
        where: {
          studentId_assignmentId: {
            studentId: targetStudentId,
            assignmentId,
          },
        },
        update: {
          score: studentScore,
          totalPoints,
          correctRate,
          grade: gradeInfo.grade,
          rank: gradeInfo.rank,
          totalStudents: agentScores.length + 1,
          percentile: gradeInfo.percentile,
          weakPattern,
          feedback,
          questionBreakdown: JSON.stringify(questionBreakdown),
          wrongQuestions: JSON.stringify(wrongQuestions),
        },
        create: {
          studentId: targetStudentId,
          assignmentId,
          score: studentScore,
          totalPoints,
          correctRate,
          grade: gradeInfo.grade,
          rank: gradeInfo.rank,
          totalStudents: agentScores.length + 1,
          percentile: gradeInfo.percentile,
          weakPattern,
          feedback,
          questionBreakdown: JSON.stringify(questionBreakdown),
          wrongQuestions: JSON.stringify(wrongQuestions),
        },
      });
    } catch {
      // 저장 실패해도 결과는 반환
    }
  }

  return NextResponse.json(result);

  } catch (err) {
    console.error("[student-analysis] Error:", err);
    return NextResponse.json(
      { error: "분석 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

function analyzeWeakPattern(
  wrongQuestions: { questionNumber: number; studentAnswer: string; correctAnswer: string; correctRate: number }[],
  totalQuestions: number
): string {
  if (wrongQuestions.length === 0) return "모든 문항을 맞혔습니다.";

  const wrongRate = (wrongQuestions.length / totalQuestions) * 100;
  const patterns: string[] = [];

  // Check if wrong answers cluster in certain ranges
  const wrongNums = wrongQuestions.map((q) => q.questionNumber);
  const firstHalf = wrongNums.filter((n) => n <= totalQuestions / 2).length;
  const secondHalf = wrongNums.filter((n) => n > totalQuestions / 2).length;

  if (firstHalf > secondHalf * 2 && firstHalf >= 3) {
    patterns.push("전반부 문항에서 오답이 집중됨");
  } else if (secondHalf > firstHalf * 2 && secondHalf >= 3) {
    patterns.push("후반부 문항에서 오답이 집중됨 (집중력 저하 가능성)");
  }

  // Check for specific wrong answer tendencies (찍기 패턴) - 객관식만
  const wrongChoiceCounts = new Map<string, number>();
  for (const q of wrongQuestions) {
    const parsed = parseInt(q.studentAnswer);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
      wrongChoiceCounts.set(q.studentAnswer, (wrongChoiceCounts.get(q.studentAnswer) ?? 0) + 1);
    }
  }
  const maxWrongChoice = [...wrongChoiceCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (maxWrongChoice && maxWrongChoice[1] >= wrongQuestions.length * 0.5 && maxWrongChoice[1] >= 5) {
    patterns.push(`${maxWrongChoice[0]}번 선택지로 일괄 응답한 흔적 (${maxWrongChoice[1]}회) - 시간 부족 가능성`);
  } else if (maxWrongChoice && maxWrongChoice[1] >= 3) {
    patterns.push(`${maxWrongChoice[0]}번 선택지로 자주 오답 (${maxWrongChoice[1]}회)`);
  }

  // Difficulty-based analysis (오답률 기준: 상=어려움, 하=쉬움)
  const easyWrong = wrongQuestions.filter((q) => q.correctRate >= 85); // 오답률 15% 미만 = 쉬운 문제
  const hardWrong = wrongQuestions.filter((q) => q.correctRate < 40);  // 오답률 60%+ = 어려운 문제

  if (easyWrong.length >= 3) {
    patterns.push(`난이도 '하'(쉬운) 문항에서 ${easyWrong.length}개 오답 - 기본기 점검 필요`);
  }

  if (hardWrong.length > 0 && easyWrong.length === 0 && wrongQuestions.length <= 5) {
    patterns.push("난이도 '상'(어려운) 문항에서만 오답 - 고난도 구간 돌파 필요");
  }

  if (wrongRate >= 50) {
    patterns.push("전체적으로 기본 개념 복습이 필요");
  } else if (wrongRate >= 30) {
    patterns.push("일부 영역에서 보완이 필요");
  }

  return patterns.length > 0 ? patterns.join(", ") : `${wrongQuestions.length}문항 오답`;
}
