"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

interface AssignmentDetail {
  id: string;
  title: string;
  totalQuestions: number;
  questions: { questionNumber: number; points: number }[];
}

interface GradingResult {
  score: number;
  totalPoints: number;
  answers: {
    questionNumber: number;
    studentAnswer: number;
    isCorrect: boolean;
  }[];
}

function SubmitAnswerContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = params.id as string;
  const isEditMode = searchParams.get("edit") === "true";

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    const promises: Promise<unknown>[] = [
      fetch(`/api/assignments/${assignmentId}`).then((r) => r.json()),
    ];

    if (isEditMode) {
      promises.push(
        fetch(`/api/submissions?assignmentId=${assignmentId}`).then((r) => r.json())
      );
    }

    Promise.all(promises).then(([assignmentData, submissionsData]) => {
      setAssignment(assignmentData as AssignmentDetail);

      if (isEditMode && Array.isArray(submissionsData) && submissionsData.length > 0) {
        const sub = submissionsData[0] as {
          id: string;
          answers: { questionNumber: number; studentAnswer: number }[];
        };
        setSubmissionId(sub.id);
        const existingAnswers: Record<number, number> = {};
        sub.answers.forEach((a) => {
          existingAnswers[a.questionNumber] = a.studentAnswer;
        });
        setAnswers(existingAnswers);
      }

      setLoading(false);
    });
  }, [assignmentId, isEditMode]);

  function updateAnswer(questionNumber: number, value: number) {
    setAnswers((prev) => ({ ...prev, [questionNumber]: value }));
  }

  async function handleSubmit() {
    if (!assignment) return;

    const unanswered = assignment.questions.filter(
      (q) => !answers[q.questionNumber]
    );
    if (unanswered.length > 0) {
      setError(
        `${unanswered.map((q) => q.questionNumber + "번").join(", ")} 문항이 미응답입니다.`
      );
      return;
    }

    setSubmitting(true);
    setError("");

    const answerPayload = Object.entries(answers).map(([num, ans]) => ({
      questionNumber: parseInt(num),
      studentAnswer: ans,
    }));

    const res = isEditMode && submissionId
      ? await fetch(`/api/submissions/${submissionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: answerPayload }),
        })
      : await fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentId, answers: answerPayload }),
        });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "제출에 실패했습니다.");
      setSubmitting(false);
      return;
    }

    setResult(data);
    setSubmitting(false);
  }

  if (loading) return <p className="text-gray-900">로딩 중...</p>;
  if (!assignment) return <p className="text-red-500">과제를 찾을 수 없습니다.</p>;

  // Show results after submission
  if (result) {
    const percentage = ((result.score / result.totalPoints) * 100).toFixed(0);
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold">채점 결과</h1>
        <p className="mb-6 text-sm text-gray-900">{assignment.title}</p>

        <div className="mb-6 rounded-lg bg-white p-6 text-center shadow-sm">
          <p className="text-5xl font-bold text-blue-600">
            {result.score}/{result.totalPoints}
          </p>
          <p className="mt-2 text-lg text-gray-900">정답률 {percentage}%</p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">문항별 결과</h2>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {result.answers.map((a) => (
              <div
                key={a.questionNumber}
                className={`rounded-lg p-2 text-center text-sm ${
                  a.isCorrect
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                <span className="block text-xs font-medium">
                  {a.questionNumber}번
                </span>
                <span className="font-bold">
                  {a.isCorrect ? "O" : "X"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => router.push("/student/dashboard")}
          className="mt-6 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          대시보드로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">
        {isEditMode ? "답안 수정" : assignment.title}
      </h1>
      <p className="mb-6 text-sm text-gray-900">
        {isEditMode ? `${assignment.title} — ` : ""}
        {assignment.totalQuestions}문항 | 각 문항의 답을 선택해 주세요 (1~5)
      </p>

      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-5">
          {assignment.questions.map((q) => (
            <div key={q.questionNumber}>
              <label className="mb-1 block text-center text-xs font-medium text-gray-900">
                {q.questionNumber}번
              </label>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => updateAnswer(q.questionNumber, n)}
                    className={`h-8 w-8 rounded text-xs font-medium transition ${
                      answers[q.questionNumber] === n
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-900">
            응답: {Object.keys(answers).length}/{assignment.totalQuestions}
          </p>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "제출 중..." : isEditMode ? "답안 수정" : "답안 제출"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SubmitAnswerPage() {
  return (
    <Suspense fallback={<p className="text-gray-900">로딩 중...</p>}>
      <SubmitAnswerContent />
    </Suspense>
  );
}
