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
  {
    grade: 1, percentile: "상위 4%", correctRange: [93, 99],
    desc: `최상위권 학생. 교과 전 영역에 걸쳐 개념 체계가 정교하게 구축되어 있음.
- 정답 행동: 지문을 정밀하게 읽고, 모든 선택지를 비교 분석한 뒤 답을 고름. 함정 선지도 대부분 간파함.
- 오답 행동: 극소수의 킬러 문항에서만 실수. 출제자가 의도한 최종 함정(2차 오답)에 빠지는 경우가 대부분. 단순 실수나 모르는 문제는 거의 없고, "아는데 미세하게 판단을 잘못한" 유형의 오답만 발생.
- 오답 선택 패턴: 틀릴 때는 반드시 "두 번째로 그럴듯한 선택지"를 고름. 절대로 말이 안 되는 오답은 고르지 않음.`,
  },
  {
    grade: 2, percentile: "상위 11%", correctRange: [85, 93],
    desc: `상위권 학생. 핵심 개념은 확실하지만, 세밀한 구별이 필요한 지점에서 가끔 흔들림.
- 정답 행동: 기본~중급 문항은 빠르고 정확하게 처리. 고난도에서도 높은 확률로 정답 도달.
- 오답 행동: "거의 맞지만 미묘하게 다른" 매력적 오답에 설득당하는 경우가 주된 실수 원인. 지문의 핵심은 파악하지만, 출제자가 설계한 함정 선지의 논리 구조에 일시적으로 끌림.
- 오답 선택 패턴: 정답과 가장 유사한 선택지를 고름. 부분적으로 참인 정보를 담은 오답에 약함. 엉뚱한 번호는 절대 고르지 않음.`,
  },
  {
    grade: 3, percentile: "상위 23%", correctRange: [76, 85],
    desc: `중상위권 학생. 단일 개념 문항은 안정적이나, 2개 이상의 개념을 연결하는 문항에서 판단력이 흔들림.
- 정답 행동: 기본 문항과 표준 응용 문항은 무난하게 정답 처리. 패턴이 익숙한 문제에 강함.
- 오답 행동: 범위 한정어("모두", "항상", "반드시", "~만")를 놓쳐 과잉 일반화하는 실수가 잦음. 지문에서 본 익숙한 키워드가 포함된 오답에 끌리는 경향. 복합 추론 문항에서 1단계는 맞지만 2단계에서 방향을 잃음.
- 오답 선택 패턴: 지문 속 키워드가 직접 언급된 선택지를 선호. 정답보다 표면적으로 더 "안전해 보이는" 선지에 끌림.`,
  },
  {
    grade: 4, percentile: "상위 40%", correctRange: [65, 76],
    desc: `중상 학생. 기본 개념은 이해하지만, 개념을 새로운 맥락에 적용하거나 변형 문제에서 약해짐.
- 정답 행동: 직접적으로 개념을 묻는 문항, 교과서에서 본 형태 그대로의 문항에서 안정적.
- 오답 행동: 낯선 소재나 지문이 등장하면 인지 부하가 증가하여 평소 아는 내용도 틀림. 선택지 소거법을 쓰지만 마지막 2개 중 오답을 고르는 경우가 많음. 조건이 2개 이상인 문항에서 하나만 확인하고 답을 선택하는 경향.
- 오답 선택 패턴: 조건의 일부만 충족하는 "부분 정답"에 빠짐. 복잡한 선지보다 단순 명료한 오답을 선호.`,
  },
  {
    grade: 5, percentile: "상위 60%", correctRange: [50, 65],
    desc: `중위권 학생. 기본기는 있으나 응용력이 부족하여 변형 문항에서 대량 실점.
- 정답 행동: 단순 사실 확인, 직관적 판단, 교과서 그대로 출제된 기본 문항은 맞힘.
- 오답 행동: 지문을 꼼꼼히 읽지 않고 키워드 위주로 훑어보다 핵심을 놓침. "이거 본 적 있다" 느낌으로 답을 고르는 경향이 강해, 비슷하지만 다른 개념을 혼동함. 선지를 끝까지 읽지 않고 앞부분만 보고 판단하는 경우 있음.
- 오답 선택 패턴: 익숙한 용어가 들어간 선지에 끌림. 지문의 특정 문장을 거의 그대로 옮긴 오답(출제자 함정)에 특히 약함.`,
  },
  {
    grade: 6, percentile: "상위 77%", correctRange: [38, 50],
    desc: `중하위권 학생. 기본기 자체가 불안정하여 쉬운 문항에서도 실수가 발생.
- 정답 행동: 매우 직관적인 문항(사진/그래프 직접 읽기, 단순 어휘 의미 등)만 안정적. 1단계 추론까지는 가능.
- 오답 행동: 핵심 개념과 주변 개념을 구분하지 못함. 비슷한 용어 간의 차이를 모르는 경우가 많아 체계적으로 틀림. 지문 없이 배경지식만으로 답하려다 오답을 고르는 경우 빈번. 뒷부분 문항에서 집중력 저하로 추가 실점.
- 오답 선택 패턴: "가장 길고 자세한 선택지가 정답일 것"이라는 편향이 있음. 확신 없을 때 가운데 번호(2, 3번)를 선호하는 경향.`,
  },
  {
    grade: 7, percentile: "상위 89%", correctRange: [25, 38],
    desc: `하위권 학생. 핵심 개념 이해가 부족하며, 직관적으로 풀 수 있는 문제만 맞힘.
- 정답 행동: 상식으로 풀 수 있는 문항, 매우 쉬운 사실 확인 문항만 정답 처리 가능.
- 오답 행동: 대부분의 문항에서 지문을 제대로 이해하지 못함. 선택지의 의미를 정확히 파악하지 못한 채 "느낌"으로 고름. 개념 간 관계를 전혀 파악하지 못해, 원인과 결과를 뒤바꿔 이해하기도 함.
- 오답 선택 패턴: 소거법 자체를 제대로 사용하지 못함. 첫 번째로 "그럴듯해 보이는" 선지를 바로 선택. 문항 후반부로 갈수록 집중력이 급격히 떨어져 더 많이 틀림.`,
  },
  {
    grade: 8, percentile: "상위 96%", correctRange: [13, 25],
    desc: `하위권 학생. 대부분의 문항에서 어려움을 겪으며, 가장 쉬운 문제 일부만 맞힘.
- 정답 행동: 일상 상식이나 매우 기초적인 어휘력으로 풀 수 있는 문항에서만 정답 가능.
- 오답 행동: 지문 독해 자체가 어려워, 문제가 무엇을 묻는지 정확히 파악하지 못하는 경우가 많음. 선택지를 읽어도 차이를 구별하지 못해 반쯤 추측으로 답을 고름. 어려운 문항을 만나면 빨리 넘기려고 대충 고름.
- 오답 선택 패턴: 지문에서 눈에 띈 단어가 포함된 아무 선지를 고름. 시간 부족으로 후반부 5~10문항은 거의 찍기에 가까움. 극단적 선지("전혀 ~없다" 등)를 피하고 무난해 보이는 것을 고르는 경향.`,
  },
  {
    grade: 9, percentile: "상위 100%", correctRange: [3, 13],
    desc: `최하위권 학생. 개념 이해가 매우 부족하며, 대부분의 답을 추측으로 선택.
- 정답 행동: 이미지를 직접 보고 판단하거나, 일상 한국어 상식만으로 풀 수 있는 극소수 문항만 맞힘.
- 오답 행동: 지문을 읽어도 내용을 거의 이해하지 못함. 문제를 읽고 답을 "고르는" 것이 아니라, 선택지 중 아무거나 "찍는" 행위에 가까움. 단, 완전한 랜덤은 아니고 눈에 익은 단어가 보이면 그쪽으로 약간 치우침.
- 오답 선택 패턴: 사실상 추측. 다만 5지선다에서 양 끝(1번, 5번)을 약간 기피하고 가운데(2, 3, 4번)를 살짝 선호하는 경향. 후반부 문항은 거의 패턴 없이 찍음.`,
  },
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

  const systemPrompt = `당신은 한국 고3 학생의 시험 응시를 시뮬레이션하는 교육 평가 전문가입니다.
각 문항의 정답이 주어져 있습니다. 당신의 역할은 문제를 직접 푸는 것이 아니라, 주어진 학생 프로필을 기반으로 "이 학생이 각 문항을 맞힐 수 있는지" 판단하는 것입니다.

핵심 원칙:
1. 각 문항의 난이도를 시험 내용을 읽고 분석하세요 (개념 난이도, 추론 단계 수, 함정 선지 유무 등).
2. 학생 프로필의 "정답 행동"과 비교하여, 이 난이도의 문항을 이 학생이 맞힐 수 있는지 판단하세요.
   - 맞힐 수 있다고 판단하면 → 정답을 그대로 출력하세요.
   - 맞힐 수 없다고 판단하면 → 프로필의 "오답 행동"과 "오답 선택 패턴"에 따라 현실적인 오답을 선택하세요.
3. 정답/오답 개수를 인위적으로 맞추지 마세요. 문항 난이도와 학생 프로필의 상호작용에 따라 자연스럽게 결정되어야 합니다.
4. 시험이 쉬우면 상위 등급 학생이 거의 만점을 받는 것이 자연스럽고, 시험이 어려우면 하위 등급 학생의 정답이 매우 적을 수 있습니다. 시험 난이도에 따라 유연하게 판단하세요.
5. 오답을 고를 때 랜덤으로 고르지 마세요. 해당 등급 학생이 실제로 빠지기 쉬운 매력적 오답을 선택하세요.

응답 형식 (JSON 배열만, 설명 없이):
[{"q": 1, "a": "3"}, {"q": 2, "a": "1"}, ...]
- 객관식: "1"~"5" 중 하나
- 복수정답: "1,3" 형태
- 주관식: 답을 직접 작성 (모르면 아무 답이나 적기)`;

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
            content: `[학생 프로필]
등급: ${profile.grade}등급 (${profile.percentile})${subGradeHint}
${profile.desc}

[시험 내용]
${examContent}

[문항 정보 (정답 포함)]
${questionsInfo}

위 학생 프로필을 기반으로 각 문항을 분석하세요:
1. 각 문항의 난이도를 파악하세요 (시험 내용을 읽고 판단).
2. 이 학생의 실력 수준에서 해당 문항을 맞힐 수 있는지 판단하세요.
3. 맞힐 수 있으면 정답을, 못 맞히면 프로필의 오답 패턴에 따라 현실적인 오답을 선택하세요.`,
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
