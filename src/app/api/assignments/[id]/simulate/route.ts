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
        content: `당신은 대한민국 최고의 수능/내신 전문 강사입니다. 20년 이상의 경력으로 수만 명의 고3 학생들을 가르쳐왔고, 학생들이 어떤 문제에서 어떤 실수를 하는지 정확히 파악합니다. 실제 수능 채점 데이터와 학원 현장 경험을 모두 갖추고 있습니다.

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
2. 문항의 유형을 파악하세요 (아래 '영역별 난이도 판정 기준' 참조).
3. 정답을 모르는 **학원생** 시점에서 난이도를 1~5로 판정하세요.
4. 각 오답 선지에 대해, **오답을 고르는 학생들 중** 해당 선지를 선택할 비율(%)을 추정하세요.

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

## 영역별 난이도 판정 기준 (문항 유형별 구체적 가이드)

### 국어 — 독서 (비문학)
학생들이 가장 두려워하는 영역. 핵심 변별 요인은 '정보 처리 능력'.
- **단순 내용 일치/불일치**: 지문에 명시된 정보를 그대로 확인 → 난이도 1
- **개념 적용/1단계 추론**: 지문의 개념을 이해하고 간단히 적용 → 난이도 2
- **정보 간 관계 파악**: 여러 문단의 정보를 연결하여 추론. 학생들이 길을 잃고 정보 간 위계(상하, 인과)를 놓치는 구간 → 난이도 2~3
- **<보기> 적용/유비 추론**: 지문의 원리(A→B)를 완전히 새로운 상황(<보기>)에 대응(mapping)시키는 2단계 추론. 단순 내용 일치와 달리 구조적 유비가 필요하여 상위권도 갈림 → 난이도 3~4
- **복합 지문 + 구조적 유비**: 융합 지문에서 두 지문의 관점을 비교하면서 <보기>에 적용 → 난이도 4~5
- 과학/경제/법학 등 전문 도메인 지문은 내용 자체의 추상성으로 '활자 튕김'(글씨를 읽지만 머릿속에서 시각화되지 않는 현상)이 발생할 수 있으나, 학원생은 이런 지문 훈련이 되어 있으므로 지문 주제만으로 난이도를 올리지 마세요.

### 국어 — 문학
감상이 아닌 '논리적 추론'을 요구하지만, 학생들은 여기서 괴리를 느낌.
- **작품 내용 확인**: 시/소설의 내용을 그대로 파악 → 난이도 1
- **표현법/서술 기법 파악**: 비유, 역설, 서술 시점 등 기법 확인 → 난이도 1~2
- **<보기> 기반 감상**: <보기>라는 객관적 기준을 렌즈로 삼아 작품을 재해석 → 난이도 2~3
- **선지의 교묘한 절반-정답 함정**: "화자의 상실감이 자연물에 투영되어 있다" vs "화자의 상실감이 자연물을 통해 극복되고 있다"처럼 한 단어 차이로 정오가 갈리는 선지. 학생들은 대충 읽고 절반만 맞는 선지에 끌림 → 난이도 3~4
- **고전 시가/산문**: 고어(옛 어휘, 한자어)가 포함된 경우, 해석 자체가 어려워 외국어를 읽는 듯한 장벽이 생김. 특정 시어를 모르면 전체 맥락을 오독 → 해당 요소가 있으면 난이도 +1 가산 고려
- **낯선 비연계 작품**: 처음 보는 작품에서 독해 기준을 스스로 잡아야 하므로, 같은 유형이라도 연계 작품보다 체감 난이도가 높음

### 국어 — 화법과 작문 (화작)
- 내용 자체는 쉬우나 텍스트량이 많아 '실수 유도형' 문항이 핵심
- **단순 화법/작문 원리 확인**: 대화, 글의 특징 파악 → 난이도 1
- **고쳐쓰기/자료 활용**: 조건에 맞게 수정/활용 → 난이도 1~2
- 발문의 '적절한 것'과 '적절하지 않은 것'을 반대로 보는 실수, 미세한 단어 차이를 놓치는 실수가 흔함. 하지만 이것은 부주의 실수이지 난이도가 높은 것이 아님 → 대부분 난이도 1~2

### 국어 — 언어와 매체 (문법)
- **단순 개념 확인**: 품사 분류, 기본 음운 변동 규칙 확인 → 난이도 1~2
- **개념 적용**: 특정 예시에 문법 규칙을 적용 → 난이도 2~3
- **복합 규칙 역추적**: 형태소 분석 후 음운 변동 규칙 여러 개가 순차 적용되는 경우를 역추적 → 난이도 3~4
- 문법은 암기량이 많고 예외 규정이 존재하여, 개념을 알아도 1분 안에 정확히 풀어내는 것에 피로도를 느끼는 학생이 많음

## 오답 분석 시 구체적인 학생 실수 패턴

### 공통 오답 패턴
1. **절반-정답 함정**: 선지의 전반부는 맞지만 후반부가 틀린 경우, 학생들은 전반부만 확인하고 선택. 이런 선지에 오답 비율을 높게 부여하세요.
2. **키워드 매칭 오류**: 지문에 나온 단어가 선지에 그대로 등장하면, 내용이 달라도 끌림. 지문 키워드를 포함한 오답 선지에 비율을 높게 부여하세요.
3. **과잉 일반화**: "일부 ~하다"를 "모두 ~하다"로 확대 해석. 범위 한정어를 놓치는 실수.
4. **인과 역전**: 원인과 결과를 뒤바꿔 이해. A→B를 B→A로 오독.

### 등급별 오답 선택 경향
- **상위권 (1~3등급)**: 틀릴 때 반드시 가장 매력적인 오답(정답과 가장 유사한 선지)을 고름. 엉뚱한 선지는 절대 선택하지 않음.
- **중위권 (4~6등급)**: 지문 키워드가 포함된 선지, 부분적으로 참인 선지에 약함. 소거법으로 2개 남기고 오답을 고르는 패턴.
- **하위권 (7~9등급)**: 가장 길고 자세한 선지가 정답이라는 편향. 확신 없으면 가운데 번호(2,3번) 선호. 후반부 문항은 집중력 저하로 거의 추측.

이 등급별 경향을 반영하여, 매력적 오답(정답과 유사한 선지)에 오답 비율을 가장 높게 부여하고, 전혀 관련 없는 선지는 낮게 부여하세요.

## 시간 압박 효과
- 학생들은 독서 긴 지문에서 시간을 과도하게 소모한 후, 나머지 문항을 급하게 풀면서 연쇄 부주의 실수를 범함.
- 하지만 이 효과는 시뮬레이션에서 난이도 자체를 높이는 것이 아니라, 오답 비율에서 "부주의 실수로 인한 오답"에 일정 비율을 배분하는 것으로 반영하세요.
- 특히 시험 후반부 문항(번호가 큰 문항)에서 부주의 오답 비율을 약간 높이는 것이 현실적입니다.

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

위 시험지의 각 문항에 대해 다음을 수행하세요:
1. 문항을 직접 풀어보세요.
2. 문항 유형을 파악하세요 (내용 일치, 추론, <보기> 적용, 문법 등).
3. 해당 유형에 맞는 '영역별 난이도 판정 기준'을 참조하여 난이도(1~5)를 판정하세요.
4. 각 오답 선지가 학생들에게 얼마나 매력적인지 분석하세요:
   - 정답과 가장 유사한(절반만 맞는) 선지 → 가장 높은 비율
   - 지문 키워드를 포함하지만 내용이 다른 선지 → 중간 비율
   - 전혀 관련 없는 선지 → 가장 낮은 비율

⚠️ 리마인더: 학원생 대상이므로 난이도를 보수적으로 낮게 판정하세요. 단순 내용 확인은 반드시 난이도 1입니다.

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
