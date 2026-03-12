"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface QuestionInput {
  questionNumber: number;
  correctAnswer: number;
  points: number;
}

export default function NewAssignmentPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questionCount, setQuestionCount] = useState(20);
  const [questions, setQuestions] = useState<QuestionInput[]>([]);
  const [step, setStep] = useState<"info" | "answers">("info");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleNextStep() {
    if (!title.trim()) {
      setError("과제 제목을 입력해 주세요.");
      return;
    }
    setQuestions(
      Array.from({ length: questionCount }, (_, i) => ({
        questionNumber: i + 1,
        correctAnswer: 1,
        points: 1,
      }))
    );
    setStep("answers");
    setError("");
  }

  function updateAnswer(index: number, answer: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, correctAnswer: answer } : q))
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, questions }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "과제 생성에 실패했습니다.");
      setSubmitting(false);
      return;
    }

    router.push("/admin/dashboard");
  }

  if (step === "info") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold">새 과제 만들기</h1>

        {error && (
          <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              과제 제목 *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2017학년도 9월 모의고사"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              문항 수
            </label>
            <input
              type="number"
              value={questionCount}
              onChange={(e) =>
                setQuestionCount(Math.max(1, parseInt(e.target.value) || 1))
              }
              min={1}
              max={100}
              className="w-32 rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleNextStep}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            다음: 정답 입력
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">정답 입력</h1>
      <p className="mb-6 text-sm text-gray-500">
        {title} — {questionCount}문항
      </p>

      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {questions.map((q, i) => (
            <div key={q.questionNumber} className="text-center">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                {q.questionNumber}번
              </label>
              <select
                value={q.correctAnswer}
                onChange={(e) => updateAnswer(i, parseInt(e.target.value))}
                className="w-full rounded border px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setStep("info")}
            className="rounded-lg border px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            이전
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "저장 중..." : "과제 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
