import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAllAgentSubmissions, generateAgentsFromTeacherAnalysis } from "@/lib/agent-simulation";
import type { TeacherQuestionAnalysis } from "@/lib/agent-simulation";
import { parseStoredExamData, sectionsToMarkdown } from "@/lib/exam-parser";
import OpenAI from "openai";

// GET: Get agent count for an assignment
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const count = await prisma.submission.count({
    where: { assignmentId: id, isAgent: true },
  });

  return NextResponse.json({ count });
}

// ─── GPT 1회 호출: 최고의 선생님이 문항 분석 ─────────────────────

async function analyzeExamAsTeacher(
  apiKey: string,
  examContent: string,
  questions: { questionNumber: number; correctAnswer: string; questionType: string }[]
): Promise<TeacherQuestionAnalysis[]> {
  const openai = new OpenAI({ apiKey });

  const questionsInfo = questions
    .map((q) => {
      const typeLabel = q.questionType === "multiple" ? "복수정답" : q.questionType === "subjective" ? "주관식" : "객관식(1~5)";
      return `${q.questionNumber}번(${typeLabel}, 정답: ${q.correctAnswer})`;
    })
    .join(", ");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `당신은 대한민국 최고의 수능/내신 전문 강사입니다. 20년 이상의 경력으로 수만 명의 고3 학생들을 가르쳐왔고, 학생들이 어떤 문제에서 어떤 실수를 하는지 정확히 파악합니다.

## 작업
각 문항을 직접 풀어보고, 고3 학생 관점에서 난이도와 오답 패턴을 분석하세요.

## 분석 절차
1. 각 문항을 직접 풀어보세요.
2. 정답을 모르는 학생의 시점에서 난이도를 1~5로 판정하세요.
3. 각 오답 선지에 대해, **오답을 고르는 학생들 중** 해당 선지를 선택할 비율(%)을 추정하세요.

## 난이도 기준
⚠️ 주의: 당신은 정답을 알고 있으므로 모든 문항이 쉬워 보일 수 있습니다. 정답을 모르는 학생의 시점에서 판단하세요.
- 1 (기본): 교과서만 읽었으면 바로 풀 수 있음. 정답률 85~97%
- 2 (표준): 1단계 추론. 정답률 70~85%
- 3 (응용): 2단계 추론, 매력적 오답 존재. 정답률 50~70%
- 4 (고난도): 복합적 사고 필요. 정답률 30~50%
- 5 (킬러): 최상위권만 풀 수 있음. 정답률 10~30%

난이도 분포 가이드 (전체 문항 대비):
- 난이도 1: 약 30%, 난이도 2: 약 30%, 난이도 3: 약 25%, 난이도 4: 약 10%, 난이도 5: 약 5%
대부분의 문항은 1~3이어야 합니다. 4~5는 정말 어려운 문항에만 부여하세요.

## 오답 분석 시 고려 사항
- 실제 수능/모의고사에서 학생들이 범하는 전형적인 실수 패턴을 반영하세요.
- 매력적 오답(정답과 유사하거나 부분적으로 맞는 선지)에 높은 비율을 부여하세요.
- 전혀 관련 없는 선지에는 낮은 비율을 부여하세요.
- 각 문항의 오답 비율 합계는 반드시 100이어야 합니다.
- 주관식 문항은 wrong 필드를 빈 객체 {}로 두세요.

## 응답 형식 (JSON 배열만, 설명 없이)
[
  {"q": 1, "d": 3, "wrong": {"1": 15, "2": 55, "4": 20, "5": 10}},
  {"q": 2, "d": 1, "wrong": {"1": 30, "3": 40, "4": 20, "5": 10}}
]
- q: 문항 번호
- d: 난이도 (1~5)
- wrong: 오답 선지별 선택 비율 (%). 정답 선지는 포함하지 말 것. 합계 = 100
  주관식이면 {}`,
      },
      {
        role: "user",
        content: `다음은 시험지에서 추출한 내용입니다:

${examContent}

문항 정보: ${questionsInfo}

위 시험지의 각 문항에 대해:
1. 직접 풀어보세요.
2. 고3 학생 기준 난이도(1~5)를 판정하세요.
3. 오답을 고르는 학생들이 어떤 선지를 고를지 비율(%)로 분석하세요.

JSON 배열만 반환해 주세요.`,
      },
    ],
    max_tokens: 4096,
    temperature: 0.3,
  });

  const text = response.choices[0]?.message?.content || "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as TeacherQuestionAnalysis[];
  return parsed.filter(
    (a) =>
      typeof a.q === "number" &&
      typeof a.d === "number" &&
      a.d >= 1 &&
      a.d <= 5 &&
      typeof a.wrong === "object"
  );
}

// Vercel 서버리스 타임아웃
export const maxDuration = 60;

// POST: Generate 100 agent submissions via single GPT analysis (Admin only)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { questionNumber: "asc" } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete existing agent submissions for this assignment
  const existingAgentSubs = await prisma.submission.findMany({
    where: { assignmentId: id, isAgent: true },
    select: { id: true },
  });
  if (existingAgentSubs.length > 0) {
    await prisma.submissionAnswer.deleteMany({
      where: { submissionId: { in: existingAgentSubs.map((s) => s.id) } },
    });
    await prisma.submission.deleteMany({
      where: { assignmentId: id, isAgent: true },
    });
  }

  // API 키 확인
  let apiKey: string | null = null;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
    apiKey = setting?.value || null;
  } catch { /* ignore */ }

  // 시험지 내용 준비
  let contentForGpt = "";
  if (assignment.examContent) {
    contentForGpt = assignment.examContent;
    const parsed = parseStoredExamData(assignment.examContent);
    if (parsed && parsed.sections.length > 0) {
      contentForGpt = sectionsToMarkdown(parsed.sections);
    }
  }

  const questionsForSim = assignment.questions.map((q) => ({
    questionNumber: q.questionNumber,
    correctAnswer: q.correctAnswer,
    questionType: q.questionType,
    points: q.points,
  }));

  // GPT 1회 호출로 선생님 분석 → 100명 생성, 실패 시 확률 기반 폴백
  let agentResults;
  let simulationMethod = "simple";

  if (contentForGpt && apiKey && apiKey !== "x") {
    try {
      const analysis = await analyzeExamAsTeacher(apiKey, contentForGpt, questionsForSim);

      if (analysis.length > 0) {
        agentResults = generateAgentsFromTeacherAnalysis(questionsForSim, analysis);
        simulationMethod = "teacher-analysis";
      } else {
        agentResults = generateAllAgentSubmissions(questionsForSim);
      }
    } catch {
      agentResults = generateAllAgentSubmissions(questionsForSim);
    }
  } else {
    agentResults = generateAllAgentSubmissions(questionsForSim);
  }

  // DB 저장
  let created = 0;
  for (const agent of agentResults) {
    const agentEmail = `agent-${id}-${created}@internal`;
    let user = await prisma.user.findFirst({ where: { email: agentEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: agentEmail,
          name: `Agent ${created + 1}`,
          role: "STUDENT",
        },
      });
    }

    await prisma.submission.create({
      data: {
        studentId: user.id,
        assignmentId: id,
        score: agent.score,
        totalPoints: agent.totalPoints,
        gradedAt: new Date(),
        isAgent: true,
        agentGrade: agent.agentGrade,
        answers: {
          create: agent.details.map((d) => ({
            questionNumber: d.questionNumber,
            studentAnswer: d.studentAnswer,
            isCorrect: d.isCorrect,
          })),
        },
      },
    });
    created++;
  }

  return NextResponse.json({
    success: true,
    agentCount: created,
    simulationMethod,
  });
}

// DELETE: Remove all agent submissions for an assignment (Admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const agentSubs = await prisma.submission.findMany({
    where: { assignmentId: id, isAgent: true },
    select: { id: true },
  });

  if (agentSubs.length > 0) {
    await prisma.submissionAnswer.deleteMany({
      where: { submissionId: { in: agentSubs.map((s) => s.id) } },
    });
    await prisma.submission.deleteMany({
      where: { assignmentId: id, isAgent: true },
    });
  }

  return NextResponse.json({ success: true, deleted: agentSubs.length });
}
