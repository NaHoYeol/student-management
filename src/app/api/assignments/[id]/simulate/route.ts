import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAllAgentSubmissions, generateAllAgentSubmissionsFromGptResults, gradeGptResultsDirectly, GRADE_DISTRIBUTION } from "@/lib/agent-simulation";
import type { QuestionDifficulty, GptGradeResult } from "@/lib/agent-simulation";
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

async function analyzeDifficulty(
  examContent: string,
  questions: { questionNumber: number; correctAnswer: string }[]
): Promise<QuestionDifficulty[]> {
  let apiKey: string | null = null;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
    apiKey = setting?.value || null;
  } catch {
    return [];
  }

  if (!apiKey || apiKey === "x") return [];

  try {
    const openai = new OpenAI({ apiKey });

    const questionsInfo = questions
      .map((q) => `${q.questionNumber}번 (정답: ${q.correctAnswer})`)
      .join(", ");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 한국 고3 학원 시험 문제의 난이도를 분석하는 전문가입니다. JSON만 반환해 주세요.

핵심 원칙:
- 이 시험의 응시자는 학원에 다니는 고3 학생들입니다. 기본기가 갖춰진 학생들이므로, 난이도를 과대평가하지 마세요.
- 단순히 지문이 길거나 선택지가 복잡해 보인다고 어려운 문제가 아닙니다. 교과 과정을 성실히 이수한 고3 학생이 해당 개념을 알고 있을 가능성을 기준으로 판단하세요.
- 대부분의 문항은 난이도 1~3에 해당해야 합니다. 난이도 4~5는 정말로 고난도인 문항에만 부여하세요.

난이도 분포 가이드 (전체 문항 대비):
- 난이도 1: 약 30% (기본 문항)
- 난이도 2: 약 30% (표준 문항)
- 난이도 3: 약 25% (변별력 문항)
- 난이도 4: 약 10% (고난도)
- 난이도 5: 약 5% (킬러 문항, 없을 수도 있음)

난이도 기준:
1 (매우 쉬움): 정답률 85~97%. 단순 개념 확인, 직관적 판단. 준비된 학생이라면 거의 틀리지 않음.
2 (쉬움): 정답률 70~85%. 기본 개념 적용, 1단계 추론. 대부분의 학생이 맞힘.
3 (보통): 정답률 50~70%. 2단계 이상 추론, 매력적 오답 존재. 상위권과 중위권이 갈리는 구간.
4 (어려움): 정답률 30~50%. 복합적 사고, 세밀한 분석 필요. 상위권도 고민하는 문제.
5 (매우 어려움): 정답률 10~30%. 킬러 문항. 고차원 추론 필요. 최상위권만 맞힘.`,
        },
        {
          role: "user",
          content: `다음은 시험지에서 추출한 내용입니다:

${examContent}

문항 정보: ${questionsInfo}

각 문항별로 난이도를 분석해 주세요. 반드시 다음 JSON 형식으로만 반환해 주세요 (설명 없이 JSON 배열만):
[
  {
    "questionNumber": 1,
    "difficulty": 3,
    "commonWrongAnswer": 2,
    "secondWrongAnswer": 4
  }
]

- difficulty: 1~5 (위 기준 참고. 대부분 1~3에 분포시키고, 4~5는 정말 어려운 문항에만 부여할 것)
- commonWrongAnswer: 학생들이 가장 많이 고르는 오답 번호 (1~5, 정답 제외)
- secondWrongAnswer: 두 번째로 많이 고르는 오답 번호 (1~5, 정답 제외)`,
        },
      ],
      max_tokens: 4096,
      temperature: 0.4,
    });

    const text = response.choices[0]?.message?.content || "";
    // Extract JSON from response (might be wrapped in markdown code block)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as QuestionDifficulty[];
    // Validate and filter
    return parsed.filter(
      (d) =>
        typeof d.questionNumber === "number" &&
        typeof d.difficulty === "number" &&
        d.difficulty >= 1 &&
        d.difficulty <= 5
    );
  } catch {
    return [];
  }
}

// ─── 100명 에이전트 GPT 병렬 판단 ────────────────────────────────

function getSubGradeHint(index: number, total: number): string {
  if (total <= 1) return "";
  const position = index / (total - 1); // 0.0 (최상위) ~ 1.0 (최하위)
  if (position <= 0.15) return "\n※ 이 학생은 이 등급 내에서 최상위에 해당합니다.";
  if (position <= 0.35) return "\n※ 이 학생은 이 등급 내에서 상위에 해당합니다.";
  if (position <= 0.65) return "\n※ 이 학생은 이 등급 내에서 중간에 해당합니다.";
  if (position <= 0.85) return "\n※ 이 학생은 이 등급 내에서 하위에 해당합니다.";
  return "\n※ 이 학생은 이 등급 내에서 최하위에 해당합니다.";
}

const GRADE_SOLVE_PROFILES = [
  { grade: 1, percentile: "상위 4%",
    wrongBehavior: "틀릴 때는 반드시 두 번째로 그럴듯한 선택지를 고름. 절대 엉뚱한 오답은 선택하지 않음." },
  { grade: 2, percentile: "상위 11%",
    wrongBehavior: "정답과 가장 유사한 선택지를 고름. 부분적으로 참인 정보를 담은 매력적 오답에 약함." },
  { grade: 3, percentile: "상위 23%",
    wrongBehavior: "지문 속 키워드가 직접 언급된 선택지를 선호. 범위 한정어를 놓쳐 과잉 일반화하는 실수." },
  { grade: 4, percentile: "상위 40%",
    wrongBehavior: "조건의 일부만 충족하는 부분 정답에 빠짐. 소거법으로 2개 남기고 오답을 고르는 패턴." },
  { grade: 5, percentile: "상위 60%",
    wrongBehavior: "익숙한 용어가 들어간 선지에 끌림. 지문을 대충 읽고 키워드 매칭으로 답을 고름." },
  { grade: 6, percentile: "상위 77%",
    wrongBehavior: "가장 길고 자세한 선택지가 정답이라는 편향. 확신 없으면 가운데 번호(2,3번) 선호." },
  { grade: 7, percentile: "상위 89%",
    wrongBehavior: "소거법 미사용. 첫 번째로 그럴듯해 보이는 선지를 바로 선택. 후반부 집중력 급락." },
  { grade: 8, percentile: "상위 96%",
    wrongBehavior: "지문에서 눈에 띈 단어가 포함된 아무 선지를 고름. 후반부 문항은 거의 찍기." },
  { grade: 9, percentile: "상위 100%",
    wrongBehavior: "사실상 추측. 양 끝(1,5번) 기피하고 가운데(2,3,4번)를 약간 선호하는 경향." },
];

async function solveExamAllAgents(
  apiKey: string,
  examContent: string,
  questions: { questionNumber: number; correctAnswer: string; questionType: string }[]
): Promise<GptGradeResult[]> {
  const openai = new OpenAI({ apiKey });

  const questionsInfo = questions
    .map((q) => {
      const typeLabel = q.questionType === "multiple" ? "복수정답" : q.questionType === "subjective" ? "주관식" : "객관식(1~5)";
      return `${q.questionNumber}번(${typeLabel}, 정답: ${q.correctAnswer})`;
    })
    .join(", ");

  const systemPrompt = `당신은 한국 고등학생 시험 응시를 시뮬레이션하는 교육 평가 전문가입니다.

## 작업 절차
1. 각 문항의 난이도를 1~5로 평가하세요.
2. 주어진 등급의 학생이 해당 난이도의 문항을 맞힐 확률을 아래 매트릭스에서 찾으세요.
3. 그 확률에 기반하여 정답 또는 오답을 결정하세요.
4. 오답일 경우, 프로필의 오답 선택 패턴에 따라 현실적인 오답을 고르세요.

## 난이도 판정 기준 (정답을 모르는 학생 관점에서 판단)
⚠️ 주의: 당신은 정답을 알고 있으므로 모든 문항이 쉬워 보일 수 있습니다. 정답을 모르는 학생의 시점에서 판단하세요.
- 1 (기본): 교과서 본문만 읽었어도 바로 풀 수 있는 문항
- 2 (표준): 1단계 추론 필요. 개념을 이해한 학생이면 무난
- 3 (응용): 2단계 이상 추론 또는 매력적 오답 존재. 중위권과 상위권이 갈리는 문항
- 4 (고난도): 복합적 사고, 세밀한 분석 필요. 상위권도 고민하는 문항
- 5 (킬러): 최상위권만 정답 도달 가능. 고차원 추론 필요

## 등급 × 난이도 정답 확률 매트릭스
         난이도1  난이도2  난이도3  난이도4  난이도5
1등급:   99%     97%     90%     75%     50%
2등급:   97%     92%     78%     55%     30%
3등급:   95%     85%     65%     38%     15%
4등급:   90%     75%     50%     25%     8%
5등급:   82%     60%     35%     15%     5%
6등급:   70%     45%     22%     8%      3%
7등급:   55%     30%     12%     4%      2%
8등급:   40%     20%     7%      2%      1%
9등급:   25%     12%     4%      1%      1%

## 응답 형식 (JSON 배열만, 설명 없이)
[{"q": 1, "d": 2, "a": "3"}, {"q": 2, "d": 4, "a": "1"}, ...]
- q: 문항 번호
- d: 난이도 (1~5)
- a: 학생의 답 (정답 또는 오답)
- 객관식: "1"~"5" 중 하나
- 복수정답: "1,3" 형태
- 주관식: 답을 직접 작성`;

  // 100명 GPT 호출 목록 생성 (수능 등급 분포: 4-7-12-17-20-17-12-7-4)
  const calls: { profile: typeof GRADE_SOLVE_PROFILES[0]; subGradeHint: string }[] = [];
  for (const { grade, count } of GRADE_DISTRIBUTION) {
    const profile = GRADE_SOLVE_PROFILES.find((p) => p.grade === grade)!;
    for (let i = 0; i < count; i++) {
      calls.push({ profile, subGradeHint: getSubGradeHint(i, count) });
    }
  }

  // 100명 전원 병렬 호출
  const makeCall = async ({ profile, subGradeHint }: typeof calls[0]): Promise<GptGradeResult | null> => {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `[학생 정보]
등급: ${profile.grade}등급 (${profile.percentile})${subGradeHint}
오답 선택 패턴: ${profile.wrongBehavior}

[시험 내용]
${examContent}

[문항 정보 (정답 포함)]
${questionsInfo}

각 문항에 대해:
1. 난이도(1~5)를 판정하세요 (정답을 모르는 학생 기준).
2. 매트릭스에서 ${profile.grade}등급 × 해당 난이도의 확률을 참고하여 정답/오답을 결정하세요.
3. 오답이면 위 오답 선택 패턴에 따라 현실적인 오답 번호를 고르세요.`,
          },
        ],
        max_tokens: 2048,
        temperature: 0.7,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as { q: number; d?: number; a: string }[];
      return {
        grade: profile.grade,
        answers: parsed
          .filter((p) => typeof p.q === "number" && p.a !== undefined)
          .map((p) => ({ questionNumber: p.q, answer: String(p.a) })),
      } as GptGradeResult;
    } catch {
      return null;
    }
  };

  const allResults = await Promise.all(calls.map(makeCall));
  return allResults.filter((r): r is GptGradeResult => r !== null && r.answers.length > 0);
}

// Vercel 서버리스 함수 타임아웃 설정 (100명 병렬 GPT 호출 + DB 저장)
export const maxDuration = 120;

// POST: Generate 100 agent submissions via 100 parallel GPT calls (Admin only)
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

  // 1차: 시험지가 있으면 100명 전원 GPT 병렬 호출
  let agentResults;
  let simulationMethod = "simple";

  if (contentForGpt && apiKey && apiKey !== "x") {
    const gptResults = await solveExamAllAgents(apiKey, contentForGpt, questionsForSim);

    if (gptResults.length >= 80) {
      // 80%+ 성공 → GPT 결과 직접 채점 (보간 없음)
      agentResults = gradeGptResultsDirectly(questionsForSim, gptResults);
      simulationMethod = "gpt-direct";
    } else if (gptResults.length >= 10) {
      // 부분 성공 → 확보된 결과로 보간 확장
      agentResults = generateAllAgentSubmissionsFromGptResults(questionsForSim, gptResults);
      simulationMethod = "gpt-interpolated";
    } else {
      // GPT 대부분 실패 → 난이도 분석 폴백
      const difficulties = await analyzeDifficulty(
        contentForGpt,
        assignment.questions.map((q) => ({
          questionNumber: q.questionNumber,
          correctAnswer: q.correctAnswer,
        }))
      );
      agentResults = generateAllAgentSubmissions(questionsForSim, difficulties.length > 0 ? difficulties : undefined);
      simulationMethod = difficulties.length > 0 ? "difficulty" : "simple";
    }
  } else {
    // 시험지 없음 → 단순 확률 기반
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
