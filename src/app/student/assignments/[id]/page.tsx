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
  const [notApproved, setNotApproved] = useState(false);
  const [inputMode, setInputMode] = useState<"button" | "typing">("button");

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
          resubmitApproved?: boolean;
          answers: { questionNumber: number; studentAnswer: number }[];
        };

        if (!sub.resubmitApproved) {
          setNotApproved(true);
          setLoading(false);
          return;
        }

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
    if (value >= 1 && value <= 5) {
      setAnswers((prev) => ({ ...prev, [questionNumber]: value }));
    }
  }

  function handleTypingInput(questionNumber: number, raw: string) {
    const val = parseInt(raw);
    if (raw === "") {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[questionNumber];
        return next;
      });
    } else if (val >= 1 && val <= 5) {
      setAnswers((prev) => ({ ...prev, [questionNumber]: val }));
    }
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

  if (loading) return <p className="text-black">로딩 중...</p>;
  if (!assignment) return <p className="text-red-500">과제를 찾을 수 없습니다.</p>;

  if (notApproved) {
    return (
      <div className="mx-auto max-w-2xl text-center py-12">
        <p className="mb-4 text-black">재제출이 승인되지 않았습니다.</p>
        <p className="mb-6 text-sm text-black">강사에게 재제출 허용을 요청해 주세요.</p>
        <button
          onClick={() => router.push("/student/assignments")}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          과제 목록으로 돌아가기
        </button>
      </div>
    );
  }

  if (result) {
    const percentage = ((result.score / result.totalPoints) * 100).toFixed(0);
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-xl font-bold sm:text-2xl">채점 결과</h1>
        <p className="mb-6 text-sm text-black">{assignment.title}</p>

        <div className="mb-6 rounded-lg bg-white p-6 text-center shadow-sm">
          <p className="text-4xl font-bold text-blue-600 sm:text-5xl">
            {result.score}/{result.totalPoints}
          </p>
          <p className="mt-2 text-base text-black sm:text-lg">정답률 {percentage}%</p>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 font-semibold">문항별 결과</h2>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10 sm:gap-3">
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
          className="mt-6 w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto sm:py-2"
        >
          대시보드로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-bold sm:text-2xl">
        {isEditMode ? "답안 수정" : assignment.title}
      </h1>
      <p className="mb-4 text-sm text-black">
        {isEditMode ? `${assignment.title} — ` : ""}
        {assignment.totalQuestions}문항 | 각 문항의 답을 선택해 주세요 (1~5)
      </p>

      {/* 입력 모드 전환 */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setInputMode("button")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            inputMode === "button"
              ? "bg-blue-600 text-white"
              : "border border-gray-300 text-black hover:bg-gray-50"
          }`}
        >
          버튼 선택
        </button>
        <button
          onClick={() => setInputMode("typing")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            inputMode === "typing"
              ? "bg-blue-600 text-white"
              : "border border-gray-300 text-black hover:bg-gray-50"
          }`}
        >
          직접 입력
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
        {inputMode === "button" ? (
          /* 버튼 모드 - 큰 버튼 */
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {assignment.questions.map((q) => (
              <div key={q.questionNumber} className="rounded-lg border border-gray-200 p-3">
                <label className="mb-2 block text-center text-sm font-semibold text-black">
                  {q.questionNumber}번
                </label>
                <div className="flex justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateAnswer(q.questionNumber, n)}
                      className={`h-10 w-10 rounded-lg text-sm font-bold transition active:scale-95 sm:h-9 sm:w-9 ${
                        answers[q.questionNumber] === n
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-gray-100 text-black hover:bg-gray-200 active:bg-gray-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* 타이핑 모드 */
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
            {assignment.questions.map((q) => (
              <div key={q.questionNumber} className="text-center">
                <label className="mb-1 block text-sm font-semibold text-black">
                  {q.questionNumber}번
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={5}
                  value={answers[q.questionNumber] ?? ""}
                  onChange={(e) => handleTypingInput(q.questionNumber, e.target.value)}
                  placeholder="-"
                  className={`w-full rounded-lg border-2 px-2 py-2.5 text-center text-lg font-bold focus:outline-none ${
                    answers[q.questionNumber]
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-black"
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-black">
            응답: {Object.keys(answers).length}/{assignment.totalQuestions}
          </p>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
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
    <Suspense fallback={<p className="text-black">로딩 중...</p>}>
      <SubmitAnswerContent />
    </Suspense>
  );
}
