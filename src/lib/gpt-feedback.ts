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

// 난이도 등급 (오답률 기준)
// 오답률 = 100 - 정답률
// 오답률 0~15% = 하(쉬움), 15~30% = 중하, 30~45% = 중, 45~60% = 중상, 60%+ = 상(어려움)
export function getDifficultyLabel(correctRate: number): string {
  const errorRate = 100 - correctRate;
  if (errorRate >= 60) return "상";
  if (errorRate >= 45) return "중상";
  if (errorRate >= 30) return "중";
  if (errorRate >= 15) return "중하";
  return "하";
}

interface QuestionAnalysis {
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  correctRate: number;
  questionText?: string;
}

export interface QuestionReference {
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  correctRate: number;
  questionText?: string;
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
  questionReference?: QuestionReference[];
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

중요: 문제 내용(지문, 문항 텍스트, 선지)이 제공된 경우, 반드시 실제 내용을 구체적으로 언급하면서 분석해야 한다. "이 문항은 ~에 관한 지문에서 ~를 묻는 문제인데" 식으로 실제 시험 내용을 인용하여 분석해. 추상적이고 일반적인 표현("복합적 사고력이 필요한 문항")만으로 때우지 마. 지문의 핵심 소재, 문항이 묻는 구체적 포인트, 오답 선지가 왜 매력적이었는지를 실제 내용 기반으로 서술해.

[문항 난이도 기준 - 오답률 기준]
오답률 60% 이상 (정답률 40% 미만) = 상 (어려운 문제)
오답률 45~60% (정답률 40~55%) = 중상
오답률 30~45% (정답률 55~70%) = 중
오답률 15~30% (정답률 70~85%) = 중하
오답률 0~15% (정답률 85% 이상) = 하 (쉬운 문제)

[핵심 분석 원칙]
단순히 수치를 나열하지 마. 수치가 내포하는 의미를 깊이 파고들어(Deep Dive) 학생의 '인지적 특징'과 '문제 해결 알고리즘'을 분석하는 형식으로 서술해.
- 점수/백분위 → 이 수치가 학생의 지식 체계 구축 수준에 대해 무엇을 말하는지 해석
- 킬러 문항 정답 → 단순히 "맞혔다"가 아니라, 어떤 인지 능력(비판적 사고력, 구조적 독해력, 복합 추론력 등)이 작동한 결과인지 분석
- 오답 선택지 패턴 → 시간 부족에 의한 것인지, 인지적 편향(Cognitive Bias)에 의한 것인지 대조하여 판별
- 오답 문항의 공통 주제/유형 → 특정 도메인(영역)에서 인지 부하(Cognitive Load)가 증가했는지 논리적으로 추론
- 매력적 오답(Attractive Distractor)에 낚인 패턴 → 출제자가 의도적으로 설계한 오답 논리 구조에 설득당한 것인지 분석

[사고 과정 - 내부적으로 수행하되 출력하지 마]
Step 1: 오답 목록에서 한 번호로 몰아찍은 흔적이 있는지 체크.
  - 특정 선택지가 전체 오답의 50% 이상 → 찍기 패턴
  - 연속 5문항 이상 같은 답 → 시간 부족/포기
  - 위 패턴이 없다면 → 각 오답은 의식적 판단의 결과이므로, 인지적 편향(Cognitive Bias) 분석으로 전환
Step 2: 틀린 문항들을 난이도 기준(상/중상/중/중하/하)으로 분류.
  - 난이도 '하'(쉬운) 문제를 틀렸으면 → 기본기 누수 또는 집중력 저하 구간
  - 난이도 '상'(어려운) 문제만 틀렸으면 → 상위권 벽. 심층 추론 단계에서 발생하는 병목 파악
  - 난이도 '중/중상' 문제를 틀렸으면 → 변별력 구간에서의 판단 흔들림. 매력적 오답에 설득당했을 가능성 분석
Step 3: 전체 문항 레퍼런스에서 학생이 정답 처리한 문항 중 난이도가 높은 것(정답률 55% 미만)을 찾아 강점 분석.
  - 해당 문항의 실제 지문 주제, 묻는 내용, 선지 구성을 읽고 구체적으로 어떤 인지 능력이 작동한 결과인지 분석
  - 전문항 정답(100점)인 경우: 가장 어려운 문항 3~5개를 골라 각각의 실제 내용을 인용하며 구체적으로 칭찬
  - 예: "19번은 [실제 지문 주제]에 관한 지문에서 [실제로 묻는 내용]을 판단하는 문제인데, 정답률 42%에 불과한 이 문항을 정확히 처리했다는 것은..."
Step 4: "틀린 문항" 데이터에서 실제 문제 내용(지문, 문항, 선지)을 읽고, 왜 틀렸을지 추론.
  - 각 오답 문항의 지문 주제와 묻는 포인트를 구체적으로 파악 (예: "조선 후기 실학 사상에 관한 지문에서 정약용의 입장을 묻는 문항")
  - 학생이 선택한 오답 선지의 내용을 읽고, 정답 선지와 비교하여 왜 그 오답이 매력적이었는지 분석
  - 오답이 발생한 문항들의 공통된 주제/유형이 있는지 확인 → 특정 도메인에서 인지 부하가 증가한 것인지 판단
Step 5: 오답 문항 번호를 순서대로 나열, 구간별(초반/중반/후반) 분포와 유형별 편중 확인.
  - 후반부 집중 오답 → 시간/집중력 관리 이슈
  - 특정 유형 집중 오답 → 해당 영역의 개념 연결 구조에서 혼란
Step 6: 오답 선택지 분포를 재검토.
  - 동일 선택지 반복 선택 → 특정 위치 선호 편향 또는 소거법 적용 실패
  - 매력적 오답에 자주 낚이는지, 특정 선지 위치에서 약한지, 특정 지문 유형에서 무너지는지 등
Step 7: 학생의 등급대에 맞는 해석 프레임 설정.
  - 1~2등급: "안정적 구조 위의 미세 균열" 관점. 높은 성취 속 소수 오답의 의미를 깊이 분석
  - 3~4등급: "변별력 구간에서의 판단력 흔들림" 관점. 중상~중 난이도에서의 득점/실점 패턴 분석
  - 5~6등급: "기본 구조의 완성도" 관점. 쉬운 문항 정답률과 중간 난이도 도전 패턴 분석
  - 7~9등급: "핵심 개념 연결의 현재 상태" 관점. 어떤 영역에서 개념 연결이 이루어지고 있는지 분석

[출력 형식]
아래 목차를 지키되, 각 항목 안에서는 데이터가 말해주는 대로 자유롭게 써. 각 섹션에서 수치를 단순 나열하지 말고, 수치가 의미하는 바를 해석하여 서술해.

### 1. 성적 지표 총평 및 위치 분석
(4~5문장. 점수, 등급, 백분위를 단순 나열이 아닌, 이 수치들이 학생의 전반적 지식 체계 구축 수준에 대해 무엇을 말하는지 해석하여 서술. 해당 등급대에서의 위치가 갖는 의미를 한 문장으로 요약. 예: 높은 정답률이 단순 암기가 아닌 정교한 지식 체계를 시사하는 것인지, 또는 기본 개념 연결이 불안정한 것인지 등.)

### 2. 변별력 문항 반응 분석
(잘 맞힌 어려운 문항을 중심으로 분석. 문제 내용이 제공된 경우 반드시 "이 문항은 [실제 지문 주제]에 관한 지문에서 [실제로 묻는 내용]을 판단하는 문제인데..." 식으로 구체적 내용을 인용하여 분석. 어떤 인지 능력이 작동했는지를 실제 문항 내용과 연결하여 서술. 데이터가 없으면 전반적 강점 패턴만 짧게 언급.)

### 3. 오답 데이터 기반 인지 패턴 진단
(오답이 없는 경우(100점): 이 섹션 대신 전체 문항 중 가장 어려운 문항 3~5개를 골라 "이 문항을 정답 처리하기 위해 필요한 인지 과정"을 실제 문제 내용을 인용하며 심층 분석. 오답이 있는 경우: 최소 3문단, 아래 3가지를 각각 소제목(**볼드**)으로 구분하여 구체적 문항 번호와 난이도 등급을 근거로 서술)

- **응시 태도 및 시간 관리 분석**: 찍기 패턴, 연속 오답, 후반부 집중 오답 등의 외적 요인이 있는지 먼저 확인. 외적 요인이 배제되면, "오답이 의식적 판단의 결과"임을 명시하고 인지적 분석으로 전환.

- **매력적 오답에 대한 인지적 편향 분석**: 오답 선택지 분포를 분석하여, 특정 선택지에 편중되는 패턴이 있는지 확인. 문제 내용이 제공된 경우, 학생이 고른 오답 선지의 실제 내용과 정답 선지의 실제 내용을 대조하여, 왜 그 오답이 매력적이었는지 구체적으로 추론. 예시: "35번에서 학생은 4번(실제 선지 내용)을 골랐는데, 정답인 2번(실제 선지 내용)과 비교하면 ~라는 점에서 혼동이 발생했을 가능성이 있습니다."

- **난이도·주제 영역별 인지 부하 분석**: 틀린 문항들의 난이도 분포와 주제/유형의 공통점을 분석. 문제 내용이 제공된 경우, 틀린 문항들이 공통적으로 다루는 구체적 주제(예: "근대 사상", "경제 원리", "문법 - 음운 변동" 등)를 실제 내용에서 추출하여 서술. 특정 주제 영역에서 인지 부하가 증가하여 판단력이 저하되는 패턴이 있는지 구체적 문항 내용을 근거로 논리적으로 추론.`;

    // 틀린 문항 데이터 (난이도 등급 + 실제 문제 내용 포함)
    const wrongQuestionsText = input.wrongQuestions
      .map((q) => {
        let line = `${q.questionNumber}번: 내 답 ${q.studentAnswer} / 정답 ${q.correctAnswer} / 정답률 ${q.correctRate.toFixed(0)}% [난이도: ${getDifficultyLabel(q.correctRate)}]`;
        if (q.questionText) {
          line += `\n  문제 내용: ${q.questionText}`;
        }
        return line;
      })
      .join("\n");

    // 난이도별 분류 (오답률 기준: 상=어려움, 하=쉬움)
    const wrongByDiff = {
      상: input.wrongQuestions.filter((q) => q.correctRate < 40),          // 오답률 60%+
      중상: input.wrongQuestions.filter((q) => q.correctRate >= 40 && q.correctRate < 55),  // 오답률 45~60%
      중: input.wrongQuestions.filter((q) => q.correctRate >= 55 && q.correctRate < 70),    // 오답률 30~45%
      중하: input.wrongQuestions.filter((q) => q.correctRate >= 70 && q.correctRate < 85),  // 오답률 15~30%
      하: input.wrongQuestions.filter((q) => q.correctRate >= 85),          // 오답률 0~15%
    };

    // 찍기 패턴
    const wrongChoiceCounts = new Map<string, number>();
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

[난이도별 오답 분류 (오답률 기준)]
- 상-어려움(오답률 60%+): ${wrongByDiff.상.length}개${wrongByDiff.상.length > 0 ? ` → ${wrongByDiff.상.map((q) => `${q.questionNumber}번(정답률${q.correctRate}%)`).join(", ")}` : ""}
- 중상(오답률 45~60%): ${wrongByDiff.중상.length}개${wrongByDiff.중상.length > 0 ? ` → ${wrongByDiff.중상.map((q) => `${q.questionNumber}번(정답률${q.correctRate}%)`).join(", ")}` : ""}
- 중(오답률 30~45%): ${wrongByDiff.중.length}개${wrongByDiff.중.length > 0 ? ` → ${wrongByDiff.중.map((q) => `${q.questionNumber}번(정답률${q.correctRate}%)`).join(", ")}` : ""}
- 중하(오답률 15~30%): ${wrongByDiff.중하.length}개${wrongByDiff.중하.length > 0 ? ` → ${wrongByDiff.중하.map((q) => `${q.questionNumber}번(정답률${q.correctRate}%)`).join(", ")}` : ""}
- 하-쉬움(오답률 0~15%): ${wrongByDiff.하.length}개${wrongByDiff.하.length > 0 ? ` → ${wrongByDiff.하.map((q) => `${q.questionNumber}번(정답률${q.correctRate}%)`).join(", ")}` : ""}`;

    // 전체 문항 레퍼런스 (AI가 자유롭게 참조)
    if (input.questionReference && input.questionReference.length > 0) {
      userPrompt += `\n\n[전체 문항 레퍼런스]
아래는 전체 시험 문항 데이터이다. 분석 시 필요한 문항을 자유롭게 참조하여 실제 내용을 구체적으로 인용하라.
✓ = 정답, ✗ = 오답\n`;
      for (const q of input.questionReference) {
        const mark = q.isCorrect ? "✓" : "✗";
        userPrompt += `\n${q.questionNumber}번 ${mark} (정답률 ${q.correctRate.toFixed(0)}%, 난이도: ${getDifficultyLabel(q.correctRate)}) 학생답: ${q.studentAnswer} / 정답: ${q.correctAnswer}`;
        if (q.questionText) {
          userPrompt += `\n  ${q.questionText}`;
        }
      }
    }

    userPrompt += `\n\n위 데이터를 분석하고 출력 형식에 맞춰 작성하시오. 이번 시험 결과 분석에만 집중할 것. 학습 조언이나 미래 계획은 쓰지 말 것. 정답 문항 중 난이도가 높은 것은 구체적으로 칭찬하고, 100점인 경우에도 어떤 어려운 문항을 잘 해결했는지 실제 내용을 인용하여 분석할 것.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 6000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || generateFallbackFeedback(input);
  } catch {
    return generateFallbackFeedback(input);
  }
}

// ─── 월별 시계열 AI 분석 ────────────────────────────────────

export interface WeeklyAssignment {
  title: string;
  dueDate: string; // ISO date string
  correctRate: number;
  score: number;
  totalPoints: number;
  grade: number | null;
  wrongQuestions: {
    questionNumber: number;
    studentAnswer: string;
    correctAnswer: string;
    correctRate: number;
  }[];
  correctQuestions: {
    questionNumber: number;
    correctRate: number;
  }[];
  /** 틀린 문항 + 어려운 정답 문항만 추출한 텍스트 (전체 시험지가 아님) */
  relevantQuestionsText?: string | null;
}

export interface MonthlyFeedbackInput {
  studentName: string;
  monthLabel: string; // "2025년 3월"
  weeklyData: {
    weekLabel: string; // "1주차 (3/5)"
    assignments: WeeklyAssignment[];
  }[];
  overallCorrectRate: number;
  overallGrade: number | null;
  trend: { correctRate: number | null; grade: number | null };
}

export async function generateMonthlyFeedback(input: MonthlyFeedbackInput): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey || apiKey === "x") {
    return generateMonthlyFallbackFeedback(input);
  }

  try {
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `[역할 및 페르소나]
너는 학생들의 월별 시험 데이터를 시계열적으로 분석하는 20대 후반 남자 학원 선생님이야.
말투는 무뚝뚝하고 담백해. 감정 표현을 줄이고 사실 위주로 말해. "~입니다", "~됩니다" 같은 딱딱한 존댓말을 써.
"정말 대단해요!", "아쉬워요~", "화이팅!" 같은 과한 감탄이나 이모지, 느낌표 남발은 하지 마.
하지만 내용 자체는 학생을 배려하고 있어야 해. 상처 주는 말은 안 하되, 필요한 말은 빠짐없이 한다.
자존감을 깎는 표현(예: "기초가 없다", "공부를 안 했다")은 쓰지 마. 대신 "이 부분은 보완이 필요합니다" 식으로 건조하게 짚어.

중요: 이 분석은 해당 월의 주차별 시험 결과를 시계열적으로 비교·분석하는 것이다. 단일 시험 분석이 아니라, 여러 시험에 걸친 패턴의 변화와 지속성을 분석하는 것이 핵심이다.

[문항 난이도 기준 - 오답률 기준]
오답률 60% 이상 (정답률 40% 미만) = 상 (어려운 문제)
오답률 45~60% (정답률 40~55%) = 중상
오답률 30~45% (정답률 55~70%) = 중
오답률 15~30% (정답률 70~85%) = 중하
오답률 0~15% (정답률 85% 이상) = 하 (쉬운 문제)

[핵심 분석 원칙 - 시계열 관점]
단순히 각 시험의 수치를 나열하지 마. 주차별 데이터의 변화 궤적에서 학생의 인지적 성장, 정체, 혹은 퇴보의 흐름을 읽어내야 한다.

- 주차별 정답률 변화 → 단순 등락이 아니라, 상승/하강의 원인을 난이도·유형·문항 수준에서 추론
- 반복 오답 패턴 분석 → 동일한 난이도 구간이나 유형에서 반복적으로 틀리는지, 아니면 개선되고 있는지 추적
- 취약점 극복 여부 → 이전 주차에서 틀렸던 유형/난이도의 문항을 이후 주차에서 맞히고 있는지 확인
- 새로운 취약점 발생 여부 → 이전엔 맞히던 유형을 최근에 틀리기 시작했는지 감지
- 난이도 대응력 변화 → 상/중상/중/중하/하 각 구간에서의 정답률이 주차별로 어떻게 변하는지 추적

[사고 과정 - 내부적으로 수행하되 출력하지 마]
Step 1: 각 주차별 오답 문항을 난이도별로 분류하고, 주차 간 난이도별 오답 비율 변화를 파악.
Step 2: 주차 간 오답 문항 번호와 유형을 대조하여, 동일 유형 반복 오답이 있는지 확인.
  - 시험지 마크다운이 제공된 경우, 실제 문제 내용을 읽고 유형 분류(추론, 비판적 독해, 세부 정보 파악, 어법, 어휘 등)
  - 유형 분류 후, 주차별로 같은 유형에서 반복적으로 틀리는지 추적
Step 3: 이전 주차에서 틀렸던 난이도/유형의 문항을 이후 주차에서 맞힌 경우 → "극복" 패턴으로 기록
Step 4: 이전 주차에서 맞히던 난이도/유형을 이후 주차에서 틀린 경우 → "퇴보" 패턴으로 기록
Step 5: 전체 추이에서 정답률이 상승세인지, 하강세인지, 정체 상태인지 판단하고, 그 원인을 위 분석과 연결
Step 6: 학생의 현재 등급대에 맞는 해석 프레임 설정 (기존 등급대별 프레임 동일 적용)

[출력 형식]
아래 목차를 지키되, 각 항목 안에서는 데이터가 말해주는 대로 자유롭게 써. 수치를 단순 나열하지 말고, 변화의 의미를 해석하여 서술해.

### 1. 월간 성적 추이 총평
(4~5문장. 해당 월의 주차별 정답률·등급 변화의 전체적인 흐름을 서술. 상승/하강/정체의 원인을 난이도 구간별 대응력 변화와 연결하여 해석. 전월 대비 변화가 있으면 언급.)

### 2. 주차별 변화 분석
(각 주차의 핵심 특징을 1~2문장씩 서술. 주차 간 정답률 변화의 원인을 구체적 문항 번호와 난이도를 들어 설명. 특정 주차에서 급등/급락이 있었다면 그 원인을 해당 시험의 문항 구성이나 학생의 오답 패턴에서 찾아 서술.)

### 3. 반복 취약 패턴 진단
(최소 2문단. 아래를 각각 소제목(**볼드**)으로 구분)

- **지속되는 취약 유형**: 여러 주차에 걸쳐 반복적으로 틀리는 난이도 구간이나 문항 유형이 있는지 분석. 시험지 내용이 있으면 해당 문항들의 공통된 특성(예: 추론형, 세부 정보 파악형 등)을 구체적으로 짚어서 서술.

- **극복된 취약점 vs 새로 발생한 취약점**: 이전 주차에서 틀렸던 유형을 이후 주차에서 맞힌 경우(극복)와, 이전엔 맞히던 유형을 최근에 틀리기 시작한 경우(신규 취약)를 구분하여 서술.

### 4. 난이도 대응력 변화
(2~3문장. 상/중상/중/중하/하 각 난이도 구간에서의 주차별 정답률 변화를 요약. 특히 변별력 구간(중/중상)에서의 대응력이 향상되고 있는지, 기본 문항(하/중하)에서의 안정성이 유지되고 있는지 분석.)`;

    // 주차별 데이터 구성
    let userPrompt = `[학생 데이터]
학생 이름: ${input.studentName}
분석 기간: ${input.monthLabel}
월 평균 정답률: ${input.overallCorrectRate}%
${input.overallGrade !== null ? `월 평균 추정 등급: ${input.overallGrade}등급` : ""}
${input.trend.correctRate !== null ? `전월 대비 정답률 변화: ${input.trend.correctRate >= 0 ? "+" : ""}${input.trend.correctRate}%p` : ""}
${input.trend.grade !== null ? `전월 대비 등급 변화: ${input.trend.grade > 0 ? "+" : ""}${input.trend.grade}등급` : ""}

[주차별 상세 데이터]`;

    for (const week of input.weeklyData) {
      userPrompt += `\n\n--- ${week.weekLabel} ---`;
      for (const a of week.assignments) {
        userPrompt += `\n\n과제: ${a.title}`;
        userPrompt += `\n마감일: ${a.dueDate}`;
        userPrompt += `\n점수: ${a.score}/${a.totalPoints} (정답률 ${a.correctRate}%)`;
        if (a.grade !== null) userPrompt += `\n추정 등급: ${a.grade}등급`;

        // 틀린 문항
        if (a.wrongQuestions.length > 0) {
          userPrompt += `\n틀린 문항 (${a.wrongQuestions.length}개):`;
          for (const q of a.wrongQuestions) {
            userPrompt += `\n  ${q.questionNumber}번: 내 답 ${q.studentAnswer} / 정답 ${q.correctAnswer} / 전체 정답률 ${q.correctRate.toFixed(0)}% [난이도: ${getDifficultyLabel(q.correctRate)}]`;
          }
        } else {
          userPrompt += `\n전문항 정답`;
        }

        // 잘 맞힌 어려운 문항 (정답률 55% 미만인데 맞힌 것)
        const impressiveCorrects = a.correctQuestions.filter((q) => q.correctRate < 55);
        if (impressiveCorrects.length > 0) {
          userPrompt += `\n잘 맞힌 어려운 문항:`;
          for (const q of impressiveCorrects.slice(0, 5)) {
            userPrompt += `\n  ${q.questionNumber}번 (전체 정답률 ${q.correctRate.toFixed(0)}%, 난이도: ${getDifficultyLabel(q.correctRate)})`;
          }
        }

        // 관련 문항 텍스트 (틀린 문항 + 어려운 정답 문항만)
        if (a.relevantQuestionsText) {
          userPrompt += `\n\n[관련 문항 원문]\n${a.relevantQuestionsText}`;
        }
      }
    }

    userPrompt += `\n\n위 주차별 데이터를 시계열적으로 분석하고 출력 형식에 맞춰 작성하시오. 각 주차 간 변화와 패턴의 지속/극복에 초점을 맞출 것. 학습 조언이나 미래 계획은 쓰지 말 것. 현재 데이터 분석에만 집중할 것.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 6000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || generateMonthlyFallbackFeedback(input);
  } catch {
    return generateMonthlyFallbackFeedback(input);
  }
}

function generateMonthlyFallbackFeedback(input: MonthlyFeedbackInput): string {
  const lines: string[] = [];
  lines.push(`${input.monthLabel} 월별 분석 결과입니다.`);
  lines.push(`총 ${input.weeklyData.length}주차에 걸쳐 분석하였습니다.`);
  lines.push(`월 평균 정답률은 ${input.overallCorrectRate}%입니다.`);
  if (input.trend.correctRate !== null) {
    lines.push(`전월 대비 ${input.trend.correctRate >= 0 ? "+" : ""}${input.trend.correctRate}%p 변화가 있었습니다.`);
  }

  // 주차별 정답률 추이
  for (const week of input.weeklyData) {
    const avgRate = Math.round(
      week.assignments.reduce((s, a) => s + a.correctRate, 0) / week.assignments.length
    );
    lines.push(`${week.weekLabel}: 평균 정답률 ${avgRate}%`);
  }

  return lines.join("\n");
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
    const easyWrong = wrongQuestions.filter((q) => q.correctRate >= 85); // 오답률 15% 미만 = 쉬운 문제
    if (easyWrong.length > 0) {
      lines.push(`난이도 '하'(쉬운) 문항(${easyWrong.map((q) => q.questionNumber + "번").join(", ")})에서 실점한 점이 확인됩니다.`);
    }
  }

  return lines.join(" ");
}
