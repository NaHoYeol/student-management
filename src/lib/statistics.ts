export interface QuestionStat {
  questionNumber: number;
  correctAnswer: string;
  questionType?: string;
  correctRate: number; // 0~100
  choiceCounts: [number, number, number, number, number]; // 1~5번 선택 수 (객관식)
  choiceRates: [number, number, number, number, number]; // 1~5번 선택 비율(%) (객관식)
}

export interface ScoreBand {
  label: string;
  min: number;
  max: number;
  count: number;
  rate: number; // %
}

export interface GradeCutoff {
  grade: number;
  minScore: number;
  maxScore: number;
  count: number;
}

export interface AnalysisResult {
  // 기본 정보
  totalStudents: number;
  totalQuestions: number;
  totalPoints: number;

  // 기초통계
  mean: number;
  median: number;
  mode: number[];
  stdDev: number;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;

  // 기술통계
  skewness: number;
  kurtosis: number;

  // 점수 분포
  scoreBands: ScoreBand[];

  // 문항별 분석
  questionStats: QuestionStat[];

  // 상위/하위 문항
  hardestQuestions: QuestionStat[];
  easiestQuestions: QuestionStat[];

  // 등급컷 (에이전트 포함 시)
  gradeCutoffs?: GradeCutoff[];
}

export interface SubInput {
  score: number;
  weight?: number; // 가중치 (기본 1.0)
  answers: { questionNumber: number; studentAnswer: string; isCorrect: boolean }[];
}

interface QInput {
  questionNumber: number;
  correctAnswer: string;
  questionType?: string;
}

// ─── 가중치 계산 헬퍼 ─────────────────────────────────────────
// 실제 학생 데이터에 높은 가중치를 부여하여 시뮬레이션 결과를 보정
// - 실제 학생: 1인당 가중치 1.0
// - 시뮬레이션: 전체 합산 가중치 = 실제학생수 × AGENT_RATIO
//   (실제 학생이 0명이면 각 1.0)
const AGENT_RATIO = 0.5;

export function computeSubmissionWeights(
  realCount: number,
  agentCount: number
): { realWeight: number; agentWeight: number } {
  if (realCount === 0) return { realWeight: 1, agentWeight: 1 };
  const agentTotalWeight = realCount * AGENT_RATIO;
  return {
    realWeight: 1,
    agentWeight: agentCount > 0 ? agentTotalWeight / agentCount : 0,
  };
}

// ─── 가중 백분위 ──────────────────────────────────────────────

function weightedPercentile(
  sortedEntries: { score: number; weight: number }[],
  p: number
): number {
  if (sortedEntries.length === 0) return 0;
  if (sortedEntries.length === 1) return sortedEntries[0].score;

  const totalWeight = sortedEntries.reduce((s, e) => s + e.weight, 0);
  const target = (p / 100) * totalWeight;

  let cumWeight = 0;
  for (let i = 0; i < sortedEntries.length; i++) {
    const prevCum = cumWeight;
    cumWeight += sortedEntries[i].weight;
    if (cumWeight >= target) {
      if (i === 0) return sortedEntries[0].score;
      // 선형 보간
      const frac = (target - prevCum) / sortedEntries[i].weight;
      return sortedEntries[i - 1].score + frac * (sortedEntries[i].score - sortedEntries[i - 1].score);
    }
  }
  return sortedEntries[sortedEntries.length - 1].score;
}

// ─── 메인 분석 함수 ──────────────────────────────────────────

export function computeAnalysis(
  questions: QInput[],
  submissions: SubInput[],
  totalPoints: number
): AnalysisResult {
  const n = submissions.length;
  const weights = submissions.map((s) => s.weight ?? 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // 점수 + 가중치 정렬
  const sortedEntries = submissions
    .map((s, i) => ({ score: s.score, weight: weights[i] }))
    .sort((a, b) => a.score - b.score);
  const scores = sortedEntries.map((e) => e.score);

  // 가중 평균
  const mean = totalWeight > 0
    ? submissions.reduce((sum, s, i) => sum + s.score * weights[i], 0) / totalWeight
    : 0;

  // 가중 중앙값
  const median = totalWeight > 0 ? weightedPercentile(sortedEntries, 50) : 0;

  // 최빈값 (가중치 기반)
  const freq = new Map<number, number>();
  for (let i = 0; i < submissions.length; i++) {
    const s = submissions[i].score;
    freq.set(s, (freq.get(s) ?? 0) + weights[i]);
  }
  const maxFreq = Math.max(...freq.values(), 0);
  const mode = Array.from(freq.entries())
    .filter(([, c]) => Math.abs(c - maxFreq) < 0.001)
    .map(([v]) => v)
    .sort((a, b) => a - b);

  // 가중 표준편차
  const variance = totalWeight > 0
    ? submissions.reduce((sum, s, i) => sum + weights[i] * (s.score - mean) ** 2, 0) / totalWeight
    : 0;
  const stdDev = Math.sqrt(variance);

  const min = scores[0] ?? 0;
  const max = scores[scores.length - 1] ?? 0;
  const q1 = weightedPercentile(sortedEntries, 25);
  const q3 = weightedPercentile(sortedEntries, 75);

  // 가중 왜도, 첨도
  let skewness = 0;
  let kurtosis = 0;
  if (n >= 3 && stdDev > 0) {
    const m3 = submissions.reduce((s, sub, i) => s + weights[i] * ((sub.score - mean) / stdDev) ** 3, 0) / totalWeight;
    const m4 = submissions.reduce((s, sub, i) => s + weights[i] * ((sub.score - mean) / stdDev) ** 4, 0) / totalWeight;
    skewness = m3;
    kurtosis = m4 - 3;
  }

  // 가중 점수 분포 (10구간)
  const bandSize = totalPoints > 0 ? totalPoints / 10 : 10;
  const scoreBands: ScoreBand[] = [];
  for (let i = 0; i < 10; i++) {
    const bMin = Math.round(bandSize * i);
    const bMax = i === 9 ? totalPoints : Math.round(bandSize * (i + 1));
    const label = `${bMin}~${bMax}`;
    let bandWeight = 0;
    for (let j = 0; j < submissions.length; j++) {
      const s = submissions[j].score;
      const inBand = i === 9 ? (s >= bMin && s <= bMax) : (s >= bMin && s < bMax);
      if (inBand) bandWeight += weights[j];
    }
    scoreBands.push({
      label,
      min: bMin,
      max: bMax,
      count: Math.round(bandWeight),
      rate: totalWeight > 0 ? (bandWeight / totalWeight) * 100 : 0,
    });
  }

  // 가중 문항별 분석
  const questionStats: QuestionStat[] = questions.map((q) => {
    const choiceWeights: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let correctWeight = 0;
    let questionTotalWeight = 0;

    for (let i = 0; i < submissions.length; i++) {
      const sub = submissions[i];
      const w = weights[i];
      const ans = sub.answers.find((a) => a.questionNumber === q.questionNumber);
      if (ans) {
        questionTotalWeight += w;
        const parsed = parseInt(ans.studentAnswer);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
          choiceWeights[parsed - 1] += w;
        }
        if (ans.isCorrect) correctWeight += w;
      }
    }

    const choiceCounts = choiceWeights.map((w) => Math.round(w)) as [number, number, number, number, number];
    const choiceRates = choiceWeights.map((w) =>
      questionTotalWeight > 0 ? (w / questionTotalWeight) * 100 : 0
    ) as [number, number, number, number, number];

    return {
      questionNumber: q.questionNumber,
      correctAnswer: q.correctAnswer,
      questionType: q.questionType,
      correctRate: questionTotalWeight > 0 ? (correctWeight / questionTotalWeight) * 100 : 0,
      choiceCounts,
      choiceRates,
    };
  });

  const sorted = [...questionStats].sort((a, b) => a.correctRate - b.correctRate);
  const hardestQuestions = sorted.slice(0, 5);
  const easiestQuestions = sorted.slice(-5).reverse();

  return {
    totalStudents: n,
    totalQuestions: questions.length,
    totalPoints,
    mean: round2(mean),
    median: round2(median),
    mode,
    stdDev: round2(stdDev),
    min,
    max,
    range: max - min,
    q1: round2(q1),
    q3: round2(q3),
    iqr: round2(q3 - q1),
    skewness: round2(skewness),
    kurtosis: round2(kurtosis),
    scoreBands,
    questionStats,
    hardestQuestions,
    easiestQuestions,
  };
}

// 에이전트 포함 전체 점수로 9등급 등급컷 산출 (가중치 미적용 — 모집단 시뮬레이션 목적)
export function computeGradeCutoffs(allScores: number[], totalPoints: number): GradeCutoff[] {
  if (allScores.length === 0) return [];
  const sorted = [...allScores].sort((a, b) => b - a); // 내림차순
  const n = sorted.length;
  // 누적 비율: 4%, 11%, 23%, 40%, 60%, 77%, 89%, 96%, 100%
  const cumPercents = [4, 11, 23, 40, 60, 77, 89, 96, 100];
  const cutoffs: GradeCutoff[] = [];
  let prevIdx = 0;

  for (let g = 0; g < 9; g++) {
    const endIdx = Math.min(Math.ceil((cumPercents[g] / 100) * n), n);
    const gradeScores = sorted.slice(prevIdx, endIdx);
    if (gradeScores.length > 0) {
      cutoffs.push({
        grade: g + 1,
        maxScore: gradeScores[0],
        minScore: gradeScores[gradeScores.length - 1],
        count: gradeScores.length,
      });
    } else {
      cutoffs.push({
        grade: g + 1,
        maxScore: prevIdx > 0 ? sorted[prevIdx - 1] : totalPoints,
        minScore: prevIdx > 0 ? sorted[prevIdx - 1] : totalPoints,
        count: 0,
      });
    }
    prevIdx = endIdx;
  }

  return cutoffs;
}

// ─── 가중 문항별 정답률 (개별 분석용) ─────────────────────────

export function computeWeightedQuestionRates(
  questions: { questionNumber: number }[],
  submissions: { isAgent: boolean; answers: { questionNumber: number; isCorrect: boolean }[] }[],
  realCount: number,
  agentCount: number
): Map<number, number> {
  const { realWeight, agentWeight } = computeSubmissionWeights(realCount, agentCount);
  const rates = new Map<number, number>();

  for (const q of questions) {
    let correctW = 0;
    let totalW = 0;
    for (const sub of submissions) {
      const w = sub.isAgent ? agentWeight : realWeight;
      const ans = sub.answers.find((a) => a.questionNumber === q.questionNumber);
      if (ans) {
        totalW += w;
        if (ans.isCorrect) correctW += w;
      }
    }
    rates.set(q.questionNumber, totalW > 0 ? (correctW / totalW) * 100 : 0);
  }

  return rates;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
