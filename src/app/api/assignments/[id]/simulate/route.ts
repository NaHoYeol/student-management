import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAllAgentSubmissions } from "@/lib/agent-simulation";
import type { QuestionDifficulty } from "@/lib/agent-simulation";
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

  // If exam content exists, analyze difficulty with GPT
  let difficulties: QuestionDifficulty[] = [];
  if (assignment.examContent) {
    // examContent가 JSON 구조이면 마크다운으로 변환하여 GPT에 전달
    let contentForGpt = assignment.examContent;
    const parsed = parseStoredExamData(assignment.examContent);
    if (parsed && parsed.sections.length > 0) {
      contentForGpt = sectionsToMarkdown(parsed.sections);
    }
    difficulties = await analyzeDifficulty(
      contentForGpt,
      assignment.questions.map((q) => ({
        questionNumber: q.questionNumber,
        correctAnswer: q.correctAnswer,
      }))
    );
  }

  // Generate 100 agent submissions
  const agentResults = generateAllAgentSubmissions(
    assignment.questions.map((q) => ({
      questionNumber: q.questionNumber,
      correctAnswer: q.correctAnswer,
      questionType: q.questionType,
      points: q.points,
    })),
    difficulties.length > 0 ? difficulties : undefined
  );

  // Create agent users and submissions
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
    usedDifficulty: difficulties.length > 0,
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
