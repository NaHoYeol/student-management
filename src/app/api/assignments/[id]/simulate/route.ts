import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAllAgentSubmissions, generateAllAgentSubmissionsFromGptResults } from "@/lib/agent-simulation";
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

// ─── 등급별 대표 에이전트 GPT 풀이 ──────────────────────────────

const GRADE_SOLVE_PROFILES = [
  { grade: 1, percentile: "상위 4%", desc: "최상위권. 거의 모든 문제를 정확하게 풀며 킬러 문항에서만 간혹 실수", correctRange: [93, 99] },
  { grade: 2, percentile: "상위 11%", desc: "상위권. 대부분 맞히지만 고난도 문항에서 매력적 오답에 빠질 수 있음", correctRange: [85, 93] },
  { grade: 3, percentile: "상위 23%", desc: "중상위권. 기본~중급은 안정적이나 변별력 문항에서 판단 흔들림", correctRange: [76, 85] },
  { grade: 4, percentile: "상위 40%", desc: "중상. 기본 개념은 이해하나 복합 추론에서 어려움", correctRange: [65, 76] },
  { grade: 5, percentile: "상위 60%", desc: "중위권. 기본 문항은 맞히나 응용에서 자주 틀림", correctRange: [50, 65] },
  { grade: 6, percentile: "상위 77%", desc: "중하위권. 기본기 불안정. 쉬운 문항에서도 실수 발생", correctRange: [38, 50] },
  { grade: 7, percentile: "상위 89%", desc: "하위권. 핵심 개념 이해 부족. 직관적 문제만 맞힘", correctRange: [25, 38] },
  { grade: 8, percentile: "상위 96%", desc: "하위권. 대부분 어려움. 쉬운 문제 일부만 맞힘", correctRange: [13, 25] },
  { grade: 9, percentile: "상위 100%", desc: "최하위권. 개념 이해 매우 부족. 대부분 추측", correctRange: [3, 13] },
];

async function solveExamByGrades(
  apiKey: string,
  examContent: string,
  questions: { questionNumber: number; correctAnswer: string; questionType: string }[]
): Promise<GptGradeResult[]> {
  const openai = new OpenAI({ apiKey });
  const totalQ = questions.length;

  const questionsInfo = questions
    .map((q) => {
      const typeLabel = q.questionType === "multiple" ? "복수정답" : q.questionType === "subjective" ? "주관식" : "객관식(1~5)";
      return `${q.questionNumber}번(${typeLabel})`;
    })
    .join(", ");

  const systemPrompt = `당신은 한국 고3 학생의 시험 응시를 시뮬레이션하는 교육 평가 전문가입니다.
주어진 학생 프로필의 실력 수준에 맞게, 각 문항에서 이 학생이 실제로 선택할 답을 예측하세요.

핵심 원칙:
- 정답을 맞히는 것이 목표가 아닙니다. 해당 등급 학생이 실제로 선택할 답을 현실적으로 예측하세요.
- 높은 등급: 대부분 정답, 고난도 문항에서만 매력적 오답 선택
- 낮은 등급: 쉬운 문항만 정답, 나머지는 학생이 실제로 헷갈릴 만한 매력적 오답 선택
- 오답을 고를 때는 랜덤이 아니라, 실제 학생이 빠지기 쉬운 함정 선지를 선택하세요
- 찍기(같은 번호 연속 선택)는 하지 마세요

응답 형식 (JSON 배열만, 설명 없이):
[{"q": 1, "a": "3"}, {"q": 2, "a": "1"}, ...]
- 객관식: "1"~"5" 중 하나
- 복수정답: "1,3" 형태
- 주관식: 답을 직접 작성 (모르면 아무 답이나 적기)`;

  const promises = GRADE_SOLVE_PROFILES.map(async (profile) => {
    const minCorrect = Math.round(totalQ * profile.correctRange[0] / 100);
    const maxCorrect = Math.round(totalQ * profile.correctRange[1] / 100);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `학생 프로필: ${profile.grade}등급 (${profile.percentile})
특성: ${profile.desc}
예상 정답률: ${profile.correctRange[0]}~${profile.correctRange[1]}%
→ 전체 ${totalQ}문항 중 약 ${minCorrect}~${maxCorrect}개를 맞혀야 합니다. 나머지는 반드시 오답을 선택하세요.

시험 내용:
${examContent}

문항 정보: ${questionsInfo}

이 ${profile.grade}등급 학생이 각 문항에서 선택할 답을 예측하세요.`,
          },
        ],
        max_tokens: 2048,
        temperature: 0.7,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as { q: number; a: string }[];
      return {
        grade: profile.grade,
        answers: parsed
          .filter((p) => typeof p.q === "number" && p.a !== undefined)
          .map((p) => ({ questionNumber: p.q, answer: String(p.a) })),
      } as GptGradeResult;
    } catch {
      return null;
    }
  });

  const allResults = await Promise.all(promises);
  return allResults.filter((r): r is GptGradeResult => r !== null && r.answers.length > 0);
}

// POST: Generate 100 agent submissions for an assignment (Admin only)
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

  // 1차: 시험지가 있으면 등급별 GPT 풀이 시도 (9회 병렬 호출)
  let agentResults;
  let simulationMethod = "simple";

  if (contentForGpt && apiKey && apiKey !== "x") {
    const gptResults = await solveExamByGrades(apiKey, contentForGpt, questionsForSim);

    if (gptResults.length >= 5) {
      // 충분한 등급 결과 → GPT 풀이 기반 생성
      agentResults = generateAllAgentSubmissionsFromGptResults(questionsForSim, gptResults);
      simulationMethod = "gpt-solve";
    } else {
      // GPT 풀이 실패 → 난이도 분석 폴백
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
