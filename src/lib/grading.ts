interface QuestionData {
  questionNumber: number;
  correctAnswer: string;
  points: number;
}

interface AnswerData {
  questionNumber: number;
  studentAnswer: string;
}

export interface GradingResult {
  score: number;
  totalPoints: number;
  details: {
    questionNumber: number;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    points: number;
  }[];
}

/** 정답 비교: 복수정답은 정렬 후 비교, 주관식은 trim 후 비교 */
export function isAnswerCorrect(correct: string, student: string): boolean {
  const c = correct.trim();
  const s = student.trim();
  if (!c || !s) return false;

  // 복수정답 (쉼표 포함)
  if (c.includes(",")) {
    const cSet = c.split(",").map((x) => x.trim()).filter(Boolean).sort().join(",");
    const sSet = s.split(",").map((x) => x.trim()).filter(Boolean).sort().join(",");
    return cSet === sSet;
  }

  return c === s;
}

export function gradeSubmission(
  questions: QuestionData[],
  answers: AnswerData[]
): GradingResult {
  const answerMap = new Map(
    answers.map((a) => [a.questionNumber, a.studentAnswer])
  );

  let score = 0;
  let totalPoints = 0;

  const details = questions.map((q) => {
    const studentAnswer = answerMap.get(q.questionNumber) ?? "";
    const isCorrect = isAnswerCorrect(q.correctAnswer, studentAnswer);
    if (isCorrect) score += q.points;
    totalPoints += q.points;

    return {
      questionNumber: q.questionNumber,
      studentAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect,
      points: q.points,
    };
  });

  return { score, totalPoints, details };
}
