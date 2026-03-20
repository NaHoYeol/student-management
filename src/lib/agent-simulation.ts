import { gradeSubmission } from "./grading";

// 수능 9등급 분포 (총 100명): 수능 비율 반영
export const GRADE_DISTRIBUTION: { grade: number; count: number; accuracyRange: [number, number] }[] = [
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

export interface QuestionInfo {
  questionNumber: number;
  correctAnswer: string;
  questionType?: string; // "choice" | "multiple" | "subjective"
  points: number;
}

interface AgentAnswer {
  questionNumber: number;
  studentAnswer: string;
}

export interface QuestionDifficulty {
  questionNumber: number;
  difficulty: number; // 1~5
  commonWrongAnswer: number; // 1~5
  secondWrongAnswer: number; // 1~5
}

// ─── 등급 × 난이도 정답 확률 매트릭스 (학원생 기준) ─────────────
// 학원에 다니는 고3 학생들은 일반 수능 모집단보다 평균 수준이 높으므로
// 전체적으로 정답률을 상향 조정. 특히 하위 등급도 기본 문항은 잘 맞힘.
// [grade][difficulty] → 정답 확률 (0~1)
export const ACCURACY_MATRIX: Record<number, Record<number, number>> = {
  1: { 1: 0.99, 2: 0.98, 3: 0.93, 4: 0.80, 5: 0.55 },
  2: { 1: 0.98, 2: 0.95, 3: 0.85, 4: 0.65, 5: 0.38 },
  3: { 1: 0.97, 2: 0.92, 3: 0.75, 4: 0.50, 5: 0.25 },
  4: { 1: 0.95, 2: 0.85, 3: 0.62, 4: 0.38, 5: 0.15 },
  5: { 1: 0.92, 2: 0.78, 3: 0.50, 4: 0.28, 5: 0.10 },
  6: { 1: 0.88, 2: 0.68, 3: 0.40, 4: 0.20, 5: 0.07 },
  7: { 1: 0.82, 2: 0.55, 3: 0.30, 4: 0.12, 5: 0.05 },
  8: { 1: 0.72, 2: 0.42, 3: 0.20, 4: 0.08, 5: 0.03 },
  9: { 1: 0.60, 2: 0.30, 3: 0.12, 4: 0.05, 5: 0.02 },
};

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 객관식 단일 정답에서 랜덤 오답 생성 */
function randomWrongChoice(correctAnswer: string): string {
  const correct = parseInt(correctAnswer);
  if (isNaN(correct) || correct < 1 || correct > 5) {
    return "__wrong__";
  }
  const choices = [1, 2, 3, 4, 5].filter((c) => c !== correct);
  return String(choices[Math.floor(Math.random() * choices.length)]);
}

/** 복수정답에서 랜덤 오답 조합 생성 */
function randomWrongMultiple(correctAnswer: string): string {
  const correctSet = correctAnswer.split(",").map((x) => x.trim()).filter(Boolean);
  const correctNums = correctSet.map(Number).filter((n) => !isNaN(n));
  const count = correctNums.length;

  const allChoices = [1, 2, 3, 4, 5];
  const wrongCombos: number[][] = [];

  function combine(start: number, combo: number[]) {
    if (combo.length === count) {
      const sorted = [...combo].sort((a, b) => a - b);
      const key = sorted.join(",");
      if (key !== correctNums.sort((a, b) => a - b).join(",")) {
        wrongCombos.push(sorted);
      }
      return;
    }
    for (let i = start; i < allChoices.length; i++) {
      combine(i + 1, [...combo, allChoices[i]]);
    }
  }
  combine(0, []);

  if (wrongCombos.length === 0) return correctAnswer;
  const chosen = wrongCombos[Math.floor(Math.random() * wrongCombos.length)];
  return chosen.join(",");
}

// ─── 선생님 분석 결과 기반 100명 생성 (GPT 1회 호출) ─────────────

export interface TeacherQuestionAnalysis {
  q: number;       // 문항 번호
  d: number;       // 난이도 1~5
  wrong: Record<string, number>; // 오답 선지별 선택 비율 (%), 합계 100
}

/** 오답 분포(wrong)에서 가중 랜덤으로 오답 선지 선택 */
function pickWrongAnswer(wrong: Record<string, number>): string {
  const entries = Object.entries(wrong).filter(([, pct]) => pct > 0);
  if (entries.length === 0) return "1"; // fallback

  const total = entries.reduce((s, [, pct]) => s + pct, 0);
  let roll = Math.random() * total;
  for (const [choice, pct] of entries) {
    roll -= pct;
    if (roll <= 0) return choice;
  }
  return entries[entries.length - 1][0];
}

/**
 * GPT 선생님 1회 분석 결과(난이도 + 선지별 오답 분포)를 기반으로
 * 수능 등급 분포에 따른 100명의 에이전트 답안을 생성.
 */
export function generateAgentsFromTeacherAnalysis(
  questions: QuestionInfo[],
  analysis: TeacherQuestionAnalysis[]
): AgentSubmissionData[] {
  const analysisMap = new Map(analysis.map((a) => [a.q, a]));
  const results: AgentSubmissionData[] = [];

  for (const { grade, count } of GRADE_DISTRIBUTION) {
    for (let i = 0; i < count; i++) {
      const answers: AgentAnswer[] = questions.map((q) => {
        const a = analysisMap.get(q.questionNumber);
        const type = q.questionType || "choice";
        const difficulty = a?.d ?? 3;

        // 등급 × 난이도 매트릭스에서 정답 확률 조회
        let correctProb = ACCURACY_MATRIX[grade]?.[difficulty] ?? 0.5;

        // 같은 등급 내에서 개인차: ±5% 노이즈
        correctProb += (Math.random() - 0.5) * 0.10;
        correctProb = Math.max(0.01, Math.min(0.99, correctProb));

        if (Math.random() < correctProb) {
          return { questionNumber: q.questionNumber, studentAnswer: q.correctAnswer };
        }

        // 오답 처리
        if (type === "subjective") {
          return { questionNumber: q.questionNumber, studentAnswer: "__wrong__" };
        }
        if (type === "multiple") {
          return { questionNumber: q.questionNumber, studentAnswer: randomWrongMultiple(q.correctAnswer) };
        }

        // 객관식: 선생님이 분석한 오답 분포 사용
        if (a?.wrong && Object.keys(a.wrong).length > 0) {
          return { questionNumber: q.questionNumber, studentAnswer: pickWrongAnswer(a.wrong) };
        }

        return { questionNumber: q.questionNumber, studentAnswer: randomWrongChoice(q.correctAnswer) };
      });

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

// ─── 단순 확률 기반 생성 (GPT 없이 폴백) ─────────────────────────

export interface AgentSubmissionData {
  agentGrade: number;
  answers: AgentAnswer[];
  score: number;
  totalPoints: number;
  details: { questionNumber: number; studentAnswer: string; isCorrect: boolean }[];
}

export function generateAllAgentSubmissions(
  questions: QuestionInfo[],
): AgentSubmissionData[] {
  const results: AgentSubmissionData[] = [];

  for (const { grade, count, accuracyRange } of GRADE_DISTRIBUTION) {
    for (let i = 0; i < count; i++) {
      const accuracy = randomInRange(accuracyRange[0], accuracyRange[1]);
      const answers = questions.map((q) => {
        const isCorrect = Math.random() < accuracy;
        if (isCorrect) {
          return { questionNumber: q.questionNumber, studentAnswer: q.correctAnswer };
        }
        const type = q.questionType || "choice";
        if (type === "multiple") {
          return { questionNumber: q.questionNumber, studentAnswer: randomWrongMultiple(q.correctAnswer) };
        }
        if (type === "subjective") {
          return { questionNumber: q.questionNumber, studentAnswer: "__wrong__" };
        }
        return { questionNumber: q.questionNumber, studentAnswer: randomWrongChoice(q.correctAnswer) };
      });
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
