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

interface SubInput {
  score: number;
  answers: { questionNumber: number; studentAnswer: string; isCorrect: boolean }[];
}

interface QInput {
  questionNumber: number;
  correctAnswer: string;
  questionType?: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeAnalysis(
  questions: QInput[],
  submissions: SubInput[],
  totalPoints: number
): AnalysisResult {
  const n = submissions.length;
  const scores = submissions.map((s) => s.score).sort((a, b) => a - b);

  // 기초통계
  const sum = scores.reduce((a, b) => a + b, 0);
  const mean = n > 0 ? sum / n : 0;
  const median = n > 0 ? percentile(scores, 50) : 0;

  // 최빈값
  const freq = new Map<number, number>();
  for (const s of scores) freq.set(s, (freq.get(s) ?? 0) + 1);
  const maxFreq = Math.max(...freq.values(), 0);
  const mode = Array.from(freq.entries())
    .filter(([, c]) => c === maxFreq)
    .map(([v]) => v)
    .sort((a, b) => a - b);

  // 표준편차
  const variance = n > 1 ? scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);

  const min = scores[0] ?? 0;
  const max = scores[scores.length - 1] ?? 0;
  const q1 = percentile(scores, 25);
  const q3 = percentile(scores, 75);

  // 왜도, 첨도
  let skewness = 0;
  let kurtosis = 0;
  if (n >= 3 && stdDev > 0) {
    const m3 = scores.reduce((s, v) => s + ((v - mean) / stdDev) ** 3, 0) / n;
    const m4 = scores.reduce((s, v) => s + ((v - mean) / stdDev) ** 4, 0) / n;
    skewness = m3;
    kurtosis = m4 - 3; // 초과첨도
  }

  // 점수 분포 (10구간)
  const bandSize = totalPoints > 0 ? totalPoints / 10 : 10;
  const scoreBands: ScoreBand[] = [];
  for (let i = 0; i < 10; i++) {
    const bMin = Math.round(bandSize * i);
    const bMax = i === 9 ? totalPoints : Math.round(bandSize * (i + 1));
    const label = `${bMin}~${bMax}`;
    const count = scores.filter((s) => {
      if (i === 9) return s >= bMin && s <= bMax;
      return s >= bMin && s < bMax;
    }).length;
    scoreBands.push({ label, min: bMin, max: bMax, count, rate: n > 0 ? (count / n) * 100 : 0 });
  }

  // 문항별 분석
  const questionStats: QuestionStat[] = questions.map((q) => {
    const choiceCounts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let correct = 0;

    for (const sub of submissions) {
      const ans = sub.answers.find((a) => a.questionNumber === q.questionNumber);
      if (ans) {
        // 객관식 선택지 분포 (studentAnswer가 숫자인 경우만)
        const parsed = parseInt(ans.studentAnswer);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
          choiceCounts[parsed - 1]++;
        }
        if (ans.isCorrect) correct++;
      }
    }

    const choiceRates = choiceCounts.map((c) => (n > 0 ? (c / n) * 100 : 0)) as [number, number, number, number, number];

    return {
      questionNumber: q.questionNumber,
      correctAnswer: q.correctAnswer,
      questionType: q.questionType,
      correctRate: n > 0 ? (correct / n) * 100 : 0,
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

// 에이전트 포함 전체 점수로 9등급 등급컷 산출
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

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
