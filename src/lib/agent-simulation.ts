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

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 객관식 단일 정답에서 랜덤 오답 생성 */
function randomWrongChoice(correctAnswer: string): string {
  const correct = parseInt(correctAnswer);
  if (isNaN(correct) || correct < 1 || correct > 5) {
    // 주관식: 틀린 답은 빈 문자열이 아니라 오답 표시
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

  // 같은 개수로 다른 조합 선택
  const allChoices = [1, 2, 3, 4, 5];
  const wrongCombos: number[][] = [];

  // 간단한 조합 생성
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

function generateAgentAnswersSimple(
  questions: QuestionInfo[],
  accuracyRate: number
): AgentAnswer[] {
  return questions.map((q) => {
    const isCorrect = Math.random() < accuracyRate;
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
}

// 난이도별 목표 정답률 (difficulty 1~5)
// 고3 학원 학생 기준으로 현실적인 정답률 설정
const DIFFICULTY_TARGETS: Record<number, number> = {
  1: 0.95,  // 매우 쉬움 - 거의 모두 맞힘 (기대 정답률 ~82%)
  2: 0.80,  // 쉬움 (기대 정답률 ~72%)
  3: 0.60,  // 보통 (기대 정답률 ~59%)
  4: 0.38,  // 어려움 (기대 정답률 ~44%)
  5: 0.18,  // 매우 어려움 - 킬러 문항 (기대 정답률 ~31%)
};

// 난이도가 정답률에 미치는 영향 비중 (0~1)
// 0.65 = 난이도 65%, 에이전트 실력 35% 영향 → 에이전트 실력도 유의미하게 반영
const DIFFICULTY_BLEND_WEIGHT = 0.65;

function generateAgentAnswersSmart(
  questions: QuestionInfo[],
  accuracyRate: number,
  difficulties: QuestionDifficulty[]
): AgentAnswer[] {
  const diffMap = new Map(difficulties.map((d) => [d.questionNumber, d]));

  return questions.map((q) => {
    const diff = diffMap.get(q.questionNumber);
    const type = q.questionType || "choice";

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

    // 주관식/복수정답 처리
    if (type === "subjective") {
      return { questionNumber: q.questionNumber, studentAnswer: "__wrong__" };
    }
    if (type === "multiple") {
      return { questionNumber: q.questionNumber, studentAnswer: randomWrongMultiple(q.correctAnswer) };
    }

    // Use common wrong answers from difficulty analysis (객관식)
    if (diff) {
      const r = Math.random();
      if (r < 0.5 && String(diff.commonWrongAnswer) !== q.correctAnswer) {
        return { questionNumber: q.questionNumber, studentAnswer: String(diff.commonWrongAnswer) };
      }
      if (r < 0.75 && String(diff.secondWrongAnswer) !== q.correctAnswer) {
        return { questionNumber: q.questionNumber, studentAnswer: String(diff.secondWrongAnswer) };
      }
    }

    // Fallback: random wrong answer
    return { questionNumber: q.questionNumber, studentAnswer: randomWrongChoice(q.correctAnswer) };
  });
}

export interface AgentSubmissionData {
  agentGrade: number;
  answers: AgentAnswer[];
  score: number;
  totalPoints: number;
  details: { questionNumber: number; studentAnswer: string; isCorrect: boolean }[];
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

// ─── GPT 등급별 풀이 결과 기반 생성 ───────────────────────────

export interface GptGradeResult {
  grade: number;
  answers: { questionNumber: number; answer: string }[];
}

/** 등급 근접도 가중 보간으로 문항별 정답 확률 산출 (복수 GPT 결과 지원) */
function computeQuestionProbability(
  targetGrade: number,
  gradeResults: Map<number, { isCorrect: boolean; answer: string }[]>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [grade, results] of gradeResults) {
    const distance = Math.abs(targetGrade - grade);
    const weight = 1 / (1 + distance * 1.5);
    // 같은 등급에 복수 결과가 있으면 정답률 평균 사용
    const correctRate = results.filter((r) => r.isCorrect).length / results.length;
    weightedSum += weight * correctRate;
    totalWeight += weight;
  }

  let prob = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

  // 자기 등급 대표의 결과를 강하게 반영
  const ownResults = gradeResults.get(targetGrade);
  if (ownResults && ownResults.length > 0) {
    const ownCorrectRate = ownResults.filter((r) => r.isCorrect).length / ownResults.length;
    prob = prob * 0.4 + ownCorrectRate * 0.6;
  }

  // ±8% 노이즈
  prob += (Math.random() - 0.5) * 0.16;
  return Math.max(0.02, Math.min(0.98, prob));
}

/** 오답 시 가장 가까운 등급의 GPT 오답을 활용 (복수 결과 지원) */
function findNearestWrongAnswer(
  targetGrade: number,
  gradeResults: Map<number, { isCorrect: boolean; answer: string }[]>,
  question: QuestionInfo
): string {
  const candidates: { distance: number; answer: string }[] = [];

  for (const [grade, results] of gradeResults) {
    const distance = Math.abs(targetGrade - grade);
    for (const result of results) {
      if (!result.isCorrect && result.answer !== question.correctAnswer) {
        candidates.push({ distance, answer: result.answer });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.distance - b.distance);
    const minDist = candidates[0].distance;
    const closest = candidates.filter((c) => c.distance === minDist);
    return closest[Math.floor(Math.random() * closest.length)].answer;
  }

  const type = question.questionType || "choice";
  if (type === "multiple") return randomWrongMultiple(question.correctAnswer);
  if (type === "subjective") return "__wrong__";
  return randomWrongChoice(question.correctAnswer);
}

/**
 * GPT 20명의 등급별 판단 결과를 기반으로 100명 에이전트 생성.
 * 20명의 GPT 결과를 근접도 가중 보간하여 100명의 답안을 생성.
 */
export function generateAllAgentSubmissionsFromGptResults(
  questions: QuestionInfo[],
  gptResults: GptGradeResult[]
): AgentSubmissionData[] {
  const results: AgentSubmissionData[] = [];

  // 문항별 × 등급별 정오답 맵 구축 (같은 등급에 복수 GPT 결과 지원)
  const questionGradeMaps = new Map<number, Map<number, { isCorrect: boolean; answer: string }[]>>();

  for (const q of questions) {
    const gradeMap = new Map<number, { isCorrect: boolean; answer: string }[]>();
    for (const gr of gptResults) {
      const ans = gr.answers.find((a) => a.questionNumber === q.questionNumber);
      if (ans) {
        const isCorrect = String(ans.answer).trim() === String(q.correctAnswer).trim();
        const existing = gradeMap.get(gr.grade) || [];
        existing.push({ isCorrect, answer: ans.answer });
        gradeMap.set(gr.grade, existing);
      }
    }
    questionGradeMaps.set(q.questionNumber, gradeMap);
  }

  for (const { grade, count, accuracyRange } of GRADE_DISTRIBUTION) {
    for (let i = 0; i < count; i++) {
      const answers: AgentAnswer[] = questions.map((q) => {
        const gradeMap = questionGradeMaps.get(q.questionNumber);
        const type = q.questionType || "choice";

        // GPT 결과가 없는 문항은 단순 확률 폴백
        if (!gradeMap || gradeMap.size === 0) {
          const accuracy = randomInRange(accuracyRange[0], accuracyRange[1]);
          if (Math.random() < accuracy) {
            return { questionNumber: q.questionNumber, studentAnswer: q.correctAnswer };
          }
          if (type === "multiple") return { questionNumber: q.questionNumber, studentAnswer: randomWrongMultiple(q.correctAnswer) };
          if (type === "subjective") return { questionNumber: q.questionNumber, studentAnswer: "__wrong__" };
          return { questionNumber: q.questionNumber, studentAnswer: randomWrongChoice(q.correctAnswer) };
        }

        const prob = computeQuestionProbability(grade, gradeMap);

        if (Math.random() < prob) {
          return { questionNumber: q.questionNumber, studentAnswer: q.correctAnswer };
        }

        return {
          questionNumber: q.questionNumber,
          studentAnswer: findNearestWrongAnswer(grade, gradeMap, q),
        };
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

/**
 * GPT 100명의 직접 판단 결과를 채점하여 AgentSubmissionData로 변환.
 * 보간 없이 GPT 응답을 그대로 사용.
 */
export function gradeGptResultsDirectly(
  questions: QuestionInfo[],
  gptResults: GptGradeResult[]
): AgentSubmissionData[] {
  return gptResults.map((gr) => {
    const answers = questions.map((q) => {
      const ans = gr.answers.find((a) => a.questionNumber === q.questionNumber);
      return {
        questionNumber: q.questionNumber,
        studentAnswer: ans ? String(ans.answer).trim() : "__wrong__",
      };
    });
    const graded = gradeSubmission(questions, answers);
    return {
      agentGrade: gr.grade,
      answers,
      score: graded.score,
      totalPoints: graded.totalPoints,
      details: graded.details.map((d) => ({
        questionNumber: d.questionNumber,
        studentAnswer: d.studentAnswer,
        isCorrect: d.isCorrect,
      })),
    };
  });
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
