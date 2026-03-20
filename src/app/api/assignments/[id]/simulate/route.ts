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

## 중요: 응시자 특성
⚠️ 이 시험의 응시자는 **학원에 다니는 고3 학생들**입니다.
- 기본기가 갖춰져 있고 해당 과목을 꾸준히 공부한 학생들입니다.
- 일반 수능 전체 모집단(1~9등급)보다 평균 수준이 높습니다.
- 따라서 난이도를 **보수적으로 낮게** 판정해야 합니다.
- 교과서 수준의 문항, 단순 개념 확인 문항은 반드시 난이도 1로 판정하세요.

## 작업
각 문항을 직접 풀어보고, 학원에 다니는 고3 학생 관점에서 난이도와 오답 패턴을 분석하세요.

## 분석 절차
1. 각 문항을 직접 풀어보세요.
2. 정답을 모르는 **학원생** 시점에서 난이도를 1~5로 판정하세요.
3. 각 오답 선지에 대해, **오답을 고르는 학생들 중** 해당 선지를 선택할 비율(%)을 추정하세요.

## 난이도 기준
⚠️ 주의: 당신은 정답을 알고 있으므로 모든 문항이 쉬워 보일 수 있습니다. 정답을 모르는 학원생의 시점에서 판단하되, 학원생의 실력을 과소평가하지 마세요.
- 1 (기본): 교과서 개념만 알면 바로 풀 수 있음. 단순 암기, 직관적 판단. 학원생 정답률 90~99%
- 2 (표준): 1단계 추론 필요. 개념을 이해한 학생이면 무난. 학원생 정답률 75~90%
- 3 (응용): 2단계 추론, 매력적 오답 존재. 상위권과 중위권이 갈림. 학원생 정답률 55~75%
- 4 (고난도): 복합적 사고, 세밀한 분석 필요. 상위권도 고민. 학원생 정답률 35~55%
- 5 (킬러): 최상위권만 풀 수 있음. 고차원 추론. 학원생 정답률 15~35%

## 난이도 분포 가이드 (전체 문항 대비)
- 난이도 1: 약 35~40% (기본 문항 — 가장 많아야 함)
- 난이도 2: 약 30% (표준 문항)
- 난이도 3: 약 20% (변별력 문항)
- 난이도 4: 약 5~10% (고난도 — 매우 드묾)
- 난이도 5: 약 0~5% (킬러 — 없을 수도 있음)
⚠️ 학원 시험에서 난이도 4~5는 시험 전체에서 1~2문항 이하여야 합니다. 대부분 1~2에 몰려야 현실적입니다.

## 오답 분석 시 고려 사항
- 실제 수능/모의고사에서 학생들이 범하는 전형적인 실수 패턴을 반영하세요.
- 매력적 오답(정답과 유사하거나 부분적으로 맞는 선지)에 높은 비율을 부여하세요.
- 전혀 관련 없는 선지에는 낮은 비율을 부여하세요.
- 각 문항의 오답 비율 합계는 반드시 100이어야 합니다.
- 주관식 문항은 wrong 필드를 빈 객체 {}로 두세요.

## 응답 형식 (JSON 배열만, 설명 없이)
[
  {"q": 1, "d": 1, "wrong": {"1": 30, "3": 40, "4": 20, "5": 10}},
  {"q": 2, "d": 2, "wrong": {"1": 15, "2": 55, "4": 20, "5": 10}}
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

  // DB 저장 (배치 최적화: 순차 300쿼리 → 배치 ~10쿼리)
  const agentEmails = agentResults.map((_, i) => `agent-${id}-${i}@internal`);

  // 1) 기존 에이전트 유저 일괄 조회
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: agentEmails } },
  });
  const userMap = new Map(existingUsers.map((u) => [u.email, u]));

  // 2) 없는 유저만 일괄 생성
  const missingEmails = agentEmails.filter((e) => !userMap.has(e));
  if (missingEmails.length > 0) {
    await prisma.user.createMany({
      data: missingEmails.map((email) => ({
        email,
        name: `Agent ${agentEmails.indexOf(email) + 1}`,
        role: "STUDENT" as const,
      })),
      skipDuplicates: true,
    });
    const newUsers = await prisma.user.findMany({
      where: { email: { in: missingEmails } },
    });
    for (const u of newUsers) userMap.set(u.email, u);
  }

  // 3) Submission 병렬 배치 생성 (20개씩)
  let created = 0;
  const SUB_BATCH = 20;
  for (let i = 0; i < agentResults.length; i += SUB_BATCH) {
    const batch = agentResults.slice(i, i + SUB_BATCH);
    await Promise.all(
      batch.map((agent, j) => {
        const idx = i + j;
        const user = userMap.get(agentEmails[idx])!;
        return prisma.submission.create({
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
      })
    );
    created += batch.length;
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
