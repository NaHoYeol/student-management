import OpenAI from "openai";
import { prisma } from "./prisma";

async function getApiKey(): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
    return setting?.value || null;
  } catch {
    return null;
  }
}

// 난이도 등급 (정답률 기준)
// 80%+ = 상(쉬움), 60~80% = 중상, 40~60% = 중, 20~40% = 중하, 20% 미만 = 하(어려움)
export function getDifficultyLabel(correctRate: number): string {
  if (correctRate >= 80) return "상";
  if (correctRate >= 60) return "중상";
  if (correctRate >= 40) return "중";
  if (correctRate >= 20) return "중하";
  return "하";
}

interface QuestionAnalysis {
  questionNumber: number;
  studentAnswer: number;
  correctAnswer: number;
  correctRate: number;
}

interface HighlightQuestion {
  questionNumber: number;
  correctRate: number;
  questionText: string;
}

export interface FeedbackInput {
  studentName: string;
  assignmentTitle: string;
  score: number;
  totalPoints: number;
  grade: number;
  rank: number;
  totalStudents: number;
  correctRate: number;
  wrongQuestions: QuestionAnalysis[];
  weakPattern: string;
  examContent?: string;
  impressiveCorrects?: HighlightQuestion[];
  criticalWrongs?: HighlightQuestion[];
}

export async function generateFeedback(input: FeedbackInput): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey || apiKey === "x") {
    return generateFallbackFeedback(input);
  }

  try {
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `[역할 및 페르소나]
너는 학생들의 시험 데이터를 분석하는 20대 후반 남자 학원 선생님이야.
말투는 무뚝뚝하고 담백해. 감정 표현을 줄이고 사실 위주로 말해. "~입니다", "~됩니다" 같은 딱딱한 존댓말을 써.
"정말 대단해요!", "아쉬워요~", "화이팅!" 같은 과한 감탄이나 이모지, 느낌표 남발은 하지 마.
하지만 내용 자체는 학생을 배려하고 있어야 해. 상처 주는 말은 안 하되, 필요한 말은 빠짐없이 한다.
자존감을 깎는 표현(예: "기초가 없다", "공부를 안 했다")은 쓰지 마. 대신 "이 부분은 보완이 필요합니다" 식으로 건조하게 짚어.

중요: 이 분석은 오직 이번 시험 결과에 대한 것이다. 미래 학습 계획, 액션 플랜, "이렇게 공부하세요" 같은 조언은 하지 마. 철저히 현재 데이터 분석에만 집중해.

[문항 난이도 기준]
정답률 80% 이상 = 상 (쉬운 문제)
정답률 60~80% = 중상
정답률 40~60% = 중
정답률 20~40% = 중하
정답률 20% 미만 = 하 (어려운 문제)

[사고 과정 - 내부적으로 수행하되 출력하지 마]
Step 1: 오답 목록에서 한 번호로 몰아찍은 흔적이 있는지 체크.
  - 특정 선택지가 전체 오답의 50% 이상 → 찍기 패턴
  - 연속 5문항 이상 같은 답 → 시간 부족/포기
Step 2: 틀린 문항들을 난이도 기준(상/중상/중/중하/하)으로 분류.
  - 난이도 '상' 문제를 틀렸으면 → 기본기 누수
  - 난이도 '하' 문제만 틀렸으면 → 상위권 벽
Step 3: "잘 맞힌 어려운 문항" 데이터에서 이 학생의 강점을 파악. 실제 문제 내용을 읽고 어떤 능력이 있는지 분석.
Step 4: "틀린 문항" 데이터에서 실제 문제 내용을 읽고, 왜 틀렸을지 추론. 어떤 유형의 함정에 빠졌는지 분석.
Step 5: 오답 문항 번호를 순서대로 나열, 구간별(초반/중반/후반) 분포와 유형별 편중 확인.
Step 6: 위에서 놓친 패턴이 없는지 한 번 더 확인.
  - 매력적 오답에 자주 낚이는지, 특정 선지 위치에서 약한지, 특정 지문 유형에서 무너지는지 등.

[출력 형식]
아래 목차를 지키되, 각 항목 안에서는 데이터가 말해주는 대로 자유롭게 써.

### 1. 성적 요약
(3~4문장. 점수, 등급, 백분위 등 팩트만 담백하게 정리. 이번 시험의 전체적인 양상을 한 문장으로 요약.)

### 2. 잘 맞힌 문항 분석
(맞은 문항 중 난이도가 높았던 문제를 구체적으로 짚어줘. 실제 문제 내용을 참고해서 "이 유형을 맞힌 건 ~한 판단력이 작동했다는 의미입니다" 식으로 건조하지만 인정해주는 톤. 데이터가 없으면 짧게 전반적 강점만 언급.)

### 3. 데이터 분석
(최소 3문단. 아래 3가지를 각각 문단으로 나누어 구체적 문항 번호와 난이도 등급을 근거로 서술)
- **시간 관리 & 응시 태도**: 찍기 패턴, 연속 오답, 시간 부족 징후 등. 없으면 "특이사항 없음"으로 짧게.
- **난이도 대비 정답률**: 어느 난이도 구간에서 점수를 잃었는지 팩트 체크. 틀린 문제의 실제 내용을 참고해서 "이 문제는 ~유형인데, ~부분에서 판단이 갈렸을 것으로 보입니다" 식으로 분석.
- **추가 발견 패턴**: 위 두 가지로 설명되지 않는 것. 네 분석력을 자유롭게 발휘해. 정해진 틀 없이 이 학생의 데이터에서 가장 의미 있는 인사이트를 찾아줘.`;

    // 틀린 문항 데이터 (난이도 등급 포함)
    const wrongQuestionsText = input.wrongQuestions
      .map((q) => `${q.questionNumber}번: 내 답 ${q.studentAnswer} / 정답 ${q.correctAnswer} / 정답률 ${q.correctRate.toFixed(0)}% [난이도: ${getDifficultyLabel(q.correctRate)}]`)
      .join("\n");

    // 난이도별 분류 (새 기준)
    const wrongByDiff = {
      상: input.wrongQuestions.filter((q) => q.correctRate >= 80),
      중상: input.wrongQuestions.filter((q) => q.correctRate >= 60 && q.correctRate < 80),
      중: input.wrongQuestions.filter((q) => q.correctRate >= 40 && q.correctRate < 60),
      중하: input.wrongQuestions.filter((q) => q.correctRate >= 20 && q.correctRate < 40),
      하: input.wrongQuestions.filter((q) => q.correctRate < 20),
    };

    // 찍기 패턴
    const wrongChoiceCounts = new Map<number, number>();
    for (const q of input.wrongQuestions) {
      wrongChoiceCounts.set(q.studentAnswer, (wrongChoiceCounts.get(q.studentAnswer) ?? 0) + 1);
    }
    const choiceDistText = [...wrongChoiceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([choice, count]) => `${choice}번: ${count}회`)
      .join(", ");

    const wrongNums = input.wrongQuestions.map((q) => q.questionNumber).sort((a, b) => a - b);

    let userPrompt = `[학생 데이터]
학생 이름: ${input.studentName}
시험: ${input.assignmentTitle}
점수: ${input.score}/${input.totalPoints} (정답률 ${input.correctRate}%)
추정 등급: ${input.grade}등급 (전국 단위 9등급제 기반)
백분위: 상위 ${((input.rank / input.totalStudents) * 100).toFixed(1)}%
시스템 감지 패턴: ${input.weakPattern}

[오답 상세]
총 오답: ${input.wrongQuestions.length}개
오답 번호(순서): ${wrongNums.join(", ")}
오답 선택지 분포: ${choiceDistText || "없음"}

${wrongQuestionsText || "없음 (전문항 정답)"}

[난이도별 오답 분류]
- 상(정답률 80%+): ${wrongByDiff.상.length}개${wrongByDiff.상.length > 0 ? ` → ${wrongByDiff.상.map((q) => `${q.questionNumber}번(${q.correctRate}%)`).join(", ")}` : ""}
- 중상(60~80%): ${wrongByDiff.중상.length}개${wrongByDiff.중상.length > 0 ? ` → ${wrongByDiff.중상.map((q) => `${q.questionNumber}번(${q.correctRate}%)`).join(", ")}` : ""}
- 중(40~60%): ${wrongByDiff.중.length}개${wrongByDiff.중.length > 0 ? ` → ${wrongByDiff.중.map((q) => `${q.questionNumber}번(${q.correctRate}%)`).join(", ")}` : ""}
- 중하(20~40%): ${wrongByDiff.중하.length}개${wrongByDiff.중하.length > 0 ? ` → ${wrongByDiff.중하.map((q) => `${q.questionNumber}번(${q.correctRate}%)`).join(", ")}` : ""}
- 하(20% 미만): ${wrongByDiff.하.length}개${wrongByDiff.하.length > 0 ? ` → ${wrongByDiff.하.map((q) => `${q.questionNumber}번(${q.correctRate}%)`).join(", ")}` : ""}`;

    // 잘 맞힌 어려운 문항
    if (input.impressiveCorrects && input.impressiveCorrects.length > 0) {
      userPrompt += `\n\n[잘 맞힌 어려운 문항 TOP 3]`;
      for (const q of input.impressiveCorrects) {
        userPrompt += `\n${q.questionNumber}번 (정답률 ${q.correctRate.toFixed(0)}%, 난이도: ${getDifficultyLabel(q.correctRate)})`;
        if (q.questionText) {
          userPrompt += `\n  문제: ${q.questionText}`;
        }
      }
    }

    // 틀린 어려운 문항
    if (input.criticalWrongs && input.criticalWrongs.length > 0) {
      userPrompt += `\n\n[틀린 문항 중 난이도 높은 TOP 3]`;
      for (const q of input.criticalWrongs) {
        const wrongQ = input.wrongQuestions.find((w) => w.questionNumber === q.questionNumber);
        userPrompt += `\n${q.questionNumber}번 (정답률 ${q.correctRate.toFixed(0)}%, 난이도: ${getDifficultyLabel(q.correctRate)} / 학생 답: ${wrongQ?.studentAnswer ?? "?"} / 정답: ${wrongQ?.correctAnswer ?? "?"})`;
        if (q.questionText) {
          userPrompt += `\n  문제: ${q.questionText}`;
        }
      }
    }

    userPrompt += `\n\n위 데이터를 분석하고 출력 형식에 맞춰 작성하시오. 이번 시험 결과 분석에만 집중할 것. 학습 조언이나 미래 계획은 쓰지 말 것.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || generateFallbackFeedback(input);
  } catch {
    return generateFallbackFeedback(input);
  }
}

function generateFallbackFeedback(input: FeedbackInput): string {
  const { score, totalPoints, grade, wrongQuestions, correctRate } = input;
  const lines: string[] = [];

  lines.push(`${totalPoints}점 만점에 ${score}점, ${grade}등급입니다.`);

  if (correctRate >= 90) {
    lines.push("전반적으로 안정적인 결과입니다.");
  } else if (correctRate >= 70) {
    lines.push("몇 가지 보완이 필요한 부분이 확인됩니다.");
  } else if (correctRate >= 50) {
    lines.push("기본 문항에서의 실수가 눈에 띕니다.");
  } else {
    lines.push("전반적인 재점검이 필요한 결과입니다.");
  }

  if (wrongQuestions.length > 0) {
    const easyWrong = wrongQuestions.filter((q) => q.correctRate >= 80);
    if (easyWrong.length > 0) {
      lines.push(`난이도 '상' 문항(${easyWrong.map((q) => q.questionNumber + "번").join(", ")})에서 실점한 점이 확인됩니다.`);
    }
  }

  return lines.join(" ");
}
