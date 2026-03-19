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
          content: `당신은 한국 수능/모의고사 문제의 난이도를 분석하는 전문가입니다. JSON만 반환해 주세요.

중요한 원칙:
- 난이도는 반드시 1~5 전체 범위를 골고루 사용해야 합니다.
- 전체 문항 중 약 15~20%는 난이도 1(매우 쉬움), 15~20%는 난이도 5(매우 어려움)로 배정하세요.
- 중간 난이도(2,3,4)에 몰아넣지 마세요. 실제 수능처럼 극단적인 쉬움과 어려움이 공존해야 합니다.

난이도 기준:
1 (매우 쉬움): 정답률 90~98% 예상. 단순 사실 확인, 기본 어휘, 직관적 독해. 거의 모든 학생이 맞힘.
2 (쉬움): 정답률 75~90% 예상. 기본 개념 적용, 간단한 추론.
3 (보통): 정답률 40~65% 예상. 중급 추론, 함정 선지가 있는 문제.
4 (어려움): 정답률 12~30% 예상. 복합적 사고, 긴 지문 분석, 세밀한 독해 필요. 대부분 틀림.
5 (매우 어려움): 정답률 3~10% 예상. 킬러 문항. 고차원 추론, 함축적 의미 파악, 복합 조건 분석. 거의 모두 틀림.`,
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

- difficulty: 1~5 (위 기준 참고. 반드시 1과 5를 포함하여 전체 범위를 골고루 사용할 것)
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
