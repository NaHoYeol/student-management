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

  const validTypes = [
    "화작_전략파악", "화작_고쳐쓰기", "화작_자료활용", "화작_조건복합",
    "문학_내용확인", "문학_표현법", "문학_보기감상", "문학_서술어함정", "문학_고전해석", "문학_고전보기",
    "독서_내용일치", "독서_개념적용", "독서_정보관계", "독서_보기적용", "독서_복합추론",
    "문법_개념확인", "문법_단일규칙", "문법_개념비교", "문법_보기규칙", "문법_복합역추적", "문법_중세국어",
  ].join(", ");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `당신은 수능 국어 문항 **유형 분류** 전문가입니다.

## 작업
각 문항을 읽고, 아래 유형 코드 목록에서 **정확히 하나**를 선택하세요.
난이도를 판단하지 마세요. 유형만 분류하면 됩니다.

## 유형 코드 목록

### 화법과 작문
- **화작_전략파악**: 화법 전략, 작문 계획, 개요 수정 확인
- **화작_고쳐쓰기**: 어법·표현·구조 수정
- **화작_자료활용**: 자료(표, 그래프, 추가 텍스트) 활용
- **화작_조건복합**: 2~3개 조건을 동시에 만족하는 답 찾기

### 문학
- **문학_내용확인**: 줄거리, 사건 순서, 인물 관계, 서술자 시점 파악
- **문학_표현법**: 표현법/기법 파악, 작품 간 비교, 공통점·차이점 (⚠️ 선지에 "역설", "반복", "시각적 이미지", "운율", "부사어" 등 문학 용어가 나열되면 이 유형)
- **문학_보기감상**: <보기>가 제시하는 관점/이론으로 작품을 재해석
- **문학_서술어함정**: 선지의 핵심 서술어 한두 단어(투영/극복, 심화/전환)로 정오가 갈리는 세밀한 감상
- **문학_고전해석**: 고전 시가/산문(고어·한자어 포함) 해석 + 내용 파악
- **문학_고전보기**: 고전 작품 + <보기> 적용 (고어 해석과 감상의 이중 부하)

### 독서 (비문학)
- **독서_내용일치**: 지문에 명시된 정보의 일치/불일치 확인
- **독서_개념적용**: 지문 개념을 1~2단계 추론으로 문항에 적용
- **독서_정보관계**: 여러 문단에 걸친 정보 간 관계(인과, 비교, 위계) 파악
- **독서_보기적용**: <보기>에 새 상황 제시 → 지문 원리를 유비/대응시키는 추론
- **독서_복합추론**: 복합/융합 지문의 관점 비교 + 고차 추론, 3점 배점 문항

### 문법
- **문법_개념확인**: 품사 분류, 문장 성분, 기본 용어 확인
- **문법_단일규칙**: 음운 변동 1개, 형태소 분석 등 단일 규칙 적용
- **문법_개념비교**: 보조용언 vs 본용언, 부사어 vs 관형어 등 유사 개념 구분
- **문법_보기규칙**: <보기>에 규칙/표 제시 → 새 예시에 적용
- **문법_복합역추적**: 음운 변동 2~3개 순차 적용, 적용 순서 역추적
- **문법_중세국어**: 중세 국어 자료 해석 + 현대 국어 비교

## 분류 기준 (이 순서로 확인)
1. 어떤 영역인가? (화작 / 문학 / 독서 / 문법)
2. <보기>가 있는가? 있다면 어떤 역할? (관점 제시 / 새 상황 / 규칙 표)
3. 발문(질문)이 무엇을 묻는가?
4. 선지의 구성은? (문학 용어 나열 → 문학_표현법 / 서술어 미세 차이 → 문학_서술어함정)

⚠️ 주의사항:
- "(가)와 (나)의 공통점", "(가)와 (나)에 대한 설명" 유형에서 선지에 표현법·기법 용어가 나열되면 → **문학_표현법**
- "(가)에 대한 감상으로 적절한 것" + 선지에 "투영/극복" 같은 서술어 미세 차이 → **문학_서술어함정**
- 독서에서 <보기>가 있으면 대부분 → **독서_보기적용**

## 오답 분석
오답을 고르는 학생들 중 각 오답 선지를 선택할 비율(%)을 추정하세요:
- 정답과 유사한(절반만 맞는) 선지 → 높은 비율
- 지문 키워드만 포함하고 내용이 다른 선지 → 중간 비율
- 전혀 관련 없는 선지 → 낮은 비율

## 응답 형식 (JSON 배열만, 설명 없이)
[
  {"q": 1, "type": "문학_표현법", "wrong": {"1": 30, "3": 40, "4": 20, "5": 10}},
  {"q": 2, "type": "독서_보기적용", "wrong": {"1": 15, "2": 55, "4": 20, "5": 10}}
]
- q: 문항 번호
- type: 위 목록의 유형 코드 중 정확히 하나
- wrong: 오답 선지별 선택 비율 (%). 정답 선지 제외. 합계 = 100. 주관식이면 {}`,
      },
      {
        role: "user",
        content: `다음은 시험지에서 추출한 내용입니다:

${examContent}

문항 정보: ${questionsInfo}

각 문항의 유형을 분류하고, 오답 선지별 선택 비율을 추정해 주세요.

유효한 유형 코드: ${validTypes}

JSON 배열만 반환해 주세요.`,
      },
    ],
    max_tokens: 4096,
    temperature: 0.2,
  });

  const text = response.choices[0]?.message?.content || "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as TeacherQuestionAnalysis[];
  return parsed.filter(
    (a) =>
      typeof a.q === "number" &&
      typeof a.type === "string" &&
      a.type.length > 0 &&
      typeof a.wrong === "object"
  );
}

// Vercel 서버리스 타임아웃 (Pro: 300초, Hobby: 60초 자동 캡)
export const maxDuration = 300;

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

  // DB 저장 (벌크 최적화: createMany 2회로 전체 저장)
  const agentEmails = agentResults.map((_, i) => `agent-${id}-${i}@internal`);

  // 1) 유저 일괄 조회/생성
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: agentEmails } },
  });
  const userMap = new Map(existingUsers.map((u) => [u.email, u]));

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

  // 2) Submission 벌크 생성 (ID 미리 생성)
  const { randomUUID } = await import("crypto");
  const now = new Date();
  const submissionRows = agentResults.map((agent, i) => {
    const user = userMap.get(agentEmails[i])!;
    return {
      id: randomUUID(),
      studentId: user.id,
      assignmentId: id,
      score: agent.score,
      totalPoints: agent.totalPoints,
      gradedAt: now,
      isAgent: true,
      agentGrade: agent.agentGrade,
    };
  });

  await prisma.submission.createMany({ data: submissionRows });

  // 3) SubmissionAnswer 벌크 생성 (단일 createMany)
  const answerRows: {
    submissionId: string;
    questionNumber: number;
    studentAnswer: string;
    isCorrect: boolean;
  }[] = [];
  for (let i = 0; i < agentResults.length; i++) {
    const subId = submissionRows[i].id;
    for (const d of agentResults[i].details) {
      answerRows.push({
        submissionId: subId,
        questionNumber: d.questionNumber,
        studentAnswer: d.studentAnswer,
        isCorrect: d.isCorrect,
      });
    }
  }

  await prisma.submissionAnswer.createMany({ data: answerRows });

  const created = agentResults.length;

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
