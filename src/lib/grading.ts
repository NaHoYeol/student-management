interface QuestionData {
  questionNumber: number;
  correctAnswer: number;
  points: number;
}

interface AnswerData {
  questionNumber: number;
  studentAnswer: number;
}

export interface GradingResult {
  score: number;
  totalPoints: number;
  details: {
    questionNumber: number;
    studentAnswer: number;
    correctAnswer: number;
    isCorrect: boolean;
    points: number;
  }[];
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
    const studentAnswer = answerMap.get(q.questionNumber) ?? 0;
    const isCorrect = studentAnswer === q.correctAnswer;
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
