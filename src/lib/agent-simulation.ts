import { gradeSubmission } from "./grading";

// 수능 9등급 분포: 4-7-12-17-20-17-12-7-4 (총 100명)
const GRADE_DISTRIBUTION: { grade: number; count: number; accuracyRange: [number, number] }[] = [
  { grade: 1, count: 4, accuracyRange: [0.93, 0.99] },
  { grade: 2, count: 7, accuracyRange: [0.85, 0.93] },
  { grade: 3, count: 12, accuracyRange: [0.76, 0.85] },
  { grade: 4, count: 17, accuracyRange: [0.65, 0.76] },
  { grade: 5, count: 20, accuracyRange: [0.50, 0.65] },
  { grade: 6, count: 17, accuracyRange: [0.38, 0.50] },
  { grade: 7, count: 12, accuracyRange: [0.25, 0.38] },
  { grade: 8, count: 7, accuracyRange: [0.13, 0.25] },
  { grade: 9, count: 4, accuracyRange: [0.03, 0.13] },
];

interface QuestionInfo {
  questionNumber: number;
  correctAnswer: number;
  points: number;
}

interface AgentAnswer {
  questionNumber: number;
  studentAnswer: number;
}

export interface QuestionDifficulty {
  questionNumber: number;
  difficulty: number; // 1~5
  commonWrongAnswer: number; // 1~5
  secondWrongAnswer: number; // 1~5
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateAgentAnswersSimple(
  questions: QuestionInfo[],
  accuracyRate: number
): AgentAnswer[] {
  return questions.map((q) => {
    const isCorrect = Math.random() < accuracyRate;
    if (isCorrect) {
      return { questionNumber: q.questionNumber, studentAnswer: q.correctAnswer };
    }
    const choices = [1, 2, 3, 4, 5].filter((c) => c !== q.correctAnswer);
    const wrong = choices[Math.floor(Math.random() * choices.length)];
    return { questionNumber: q.questionNumber, studentAnswer: wrong };
  });
}

// 난이도별 목표 정답률 (difficulty 1~5)
// 실제 수능 데이터 기반: 쉬운 문항 90%+, 킬러 문항 10~20%
const DIFFICULTY_TARGETS: Record<number, number> = {
  1: 0.93,  // 매우 쉬움 - 대부분 맞힘
  2: 0.78,  // 쉬움
  3: 0.55,  // 보통
  4: 0.30,  // 어려움
  5: 0.12,  // 매우 어려움 (킬러 문항)
};

// 난이도가 정답률에 미치는 영향 비중 (0~1)
// 0.6 = 난이도가 60%, 에이전트 실력이 40% 영향
const DIFFICULTY_BLEND_WEIGHT = 0.6;

function generateAgentAnswersSmart(
  questions: QuestionInfo[],
  accuracyRate: number,
  difficulties: QuestionDifficulty[]
): AgentAnswer[] {
  const diffMap = new Map(difficulties.map((d) => [d.questionNumber, d]));

  return questions.map((q) => {
    const diff = diffMap.get(q.questionNumber);

    let adjustedAccuracy = accuracyRate;
    if (diff) {
      const target = DIFFICULTY_TARGETS[diff.difficulty] ?? 0.55;
      // 에이전트 실력과 문항 난이도 목표를 블렌딩
      adjustedAccuracy =
        accuracyRate * (1 - DIFFICULTY_BLEND_WEIGHT) +
        target * DIFFICULTY_BLEND_WEIGHT;
      // 약간의 랜덤성 추가 (±5%)
      adjustedAccuracy += (Math.random() - 0.5) * 0.1;
      adjustedAccuracy = Math.max(0.02, Math.min(0.99, adjustedAccuracy));
    }

    const isCorrect = Math.random() < adjustedAccuracy;
    if (isCorrect) {
      return { questionNumber: q.questionNumber, studentAnswer: q.correctAnswer };
    }

    // Use common wrong answers from difficulty analysis
    if (diff) {
      const r = Math.random();
      if (r < 0.5 && diff.commonWrongAnswer !== q.correctAnswer) {
        return { questionNumber: q.questionNumber, studentAnswer: diff.commonWrongAnswer };
      }
      if (r < 0.75 && diff.secondWrongAnswer !== q.correctAnswer) {
        return { questionNumber: q.questionNumber, studentAnswer: diff.secondWrongAnswer };
      }
    }

    // Fallback: random wrong answer
    const choices = [1, 2, 3, 4, 5].filter((c) => c !== q.correctAnswer);
    const wrong = choices[Math.floor(Math.random() * choices.length)];
    return { questionNumber: q.questionNumber, studentAnswer: wrong };
  });
}

export interface AgentSubmissionData {
  agentGrade: number;
  answers: AgentAnswer[];
  score: number;
  totalPoints: number;
  details: { questionNumber: number; studentAnswer: number; isCorrect: boolean }[];
}

export function generateAllAgentSubmissions(
  questions: QuestionInfo[],
  difficulties?: QuestionDifficulty[]
): AgentSubmissionData[] {
  const results: AgentSubmissionData[] = [];
  const useSmart = difficulties && difficulties.length > 0;

  for (const { grade, count, accuracyRange } of GRADE_DISTRIBUTION) {
    for (let i = 0; i < count; i++) {
      const accuracy = randomInRange(accuracyRange[0], accuracyRange[1]);
      const answers = useSmart
        ? generateAgentAnswersSmart(questions, accuracy, difficulties)
        : generateAgentAnswersSimple(questions, accuracy);
      const graded = gradeSubmission(questions, answers);

      results.push({
        agentGrade: grade,
        answers,
        score: graded.score,
        totalPoints: graded.totalPoints,
        details: graded.details.map((d) => ({
          questionNumber: d.questionNumber,
          studentAnswer: d.studentAnswer,
          isCorrect: d.isCorrect,
        })),
      });
    }
  }

  return results;
}

// 실제 점수를 100명 에이전트 점수 속에 넣어 등급 추정
export function estimateGrade(
  studentScore: number,
  agentScores: number[]
): { grade: number; rank: number; percentile: number } {
  const all = [...agentScores, studentScore].sort((a, b) => b - a);
  const rank = all.indexOf(studentScore) + 1;
  const totalCount = all.length; // 101 (100 agents + 1 student)
  const percentile = ((totalCount - rank) / totalCount) * 100;

  // 수능 등급 컷 (누적 비율 기준)
  const gradeCuts = [4, 11, 23, 40, 60, 77, 89, 96, 100];
  const rankPercent = (rank / totalCount) * 100;
  let grade = 9;
  for (let i = 0; i < gradeCuts.length; i++) {
    if (rankPercent <= gradeCuts[i]) {
      grade = i + 1;
      break;
    }
  }

  return { grade, rank, percentile: Math.round(percentile * 10) / 10 };
}
