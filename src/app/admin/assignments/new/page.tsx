"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { distributePoints } from "@/lib/distribute-points";

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

  function downloadSampleCSV() {
    const rows = ["문항번호,정답,배점"];
    const pts = distributePoints(questionCount);
    for (let i = 1; i <= questionCount; i++) {
      rows.push(`${i},1,${pts[i - 1]}`);
    }
    const bom = "\uFEFF";
    const blob = new Blob([bom + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "정답양식.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCSV(text: string): QuestionInput[] | null {
    const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed: { questionNumber: number; correctAnswer: number; points: number | null }[] = [];
    let hasExplicitPoints = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && /[가-힣a-zA-Z]/.test(line)) continue;

      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 2) continue;

      const questionNumber = parseInt(cols[0]);
      const correctAnswer = parseInt(cols[1]);
      const explicitPoints = cols[2] ? parseInt(cols[2]) : null;

      if (explicitPoints !== null) hasExplicitPoints = true;

      if (isNaN(questionNumber) || isNaN(correctAnswer) || correctAnswer < 1 || correctAnswer > 5) {
        return null;
      }
      parsed.push({ questionNumber, correctAnswer, points: explicitPoints });
    }

    if (parsed.length === 0) return null;

    parsed.sort((a, b) => a.questionNumber - b.questionNumber);

    if (hasExplicitPoints) {
      return parsed.map((q) => ({ ...q, points: q.points ?? 1 }));
    }

    const pts = distributePoints(parsed.length);
    return parsed.map((q, i) => ({ ...q, points: pts[i] }));
  }

  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed) {
        setError("CSV 형식이 올바르지 않습니다. (문항번호,정답 형식으로 작성해 주세요)");
        return;
      }
      setQuestions(parsed);
      setQuestionCount(parsed.length);
      if (title.trim()) {
        setStep("answers");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleNextStep() {
    if (!title.trim()) {
      setError("과제 제목을 입력해 주세요.");
      return;
    }
    if (questions.length === 0) {
      const pts = distributePoints(questionCount);
      setQuestions(
        Array.from({ length: questionCount }, (_, i) => ({
          questionNumber: i + 1,
          correctAnswer: 1,
          points: pts[i],
        }))
      );
    }
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
            <label className="mb-1 block text-sm font-medium text-gray-900">
              과제 제목 *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2017학년도 9월 모의고사"
              className="w-full rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">
              설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-gray-900">
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
              className="w-32 rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-6 rounded-lg border-2 border-dashed border-gray-300 p-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-900">
                CSV 파일로 정답 업로드 (선택)
              </label>
              <button
                type="button"
                onClick={downloadSampleCSV}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                예시 CSV 다운로드
              </button>
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="block w-full text-sm text-gray-900 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
            />
            <p className="mt-2 text-xs text-gray-900">
              양식: 문항번호,정답,배점 (예: 1,3,2) — 배점 생략 시 총 100점 자동 분배, 첫 행 헤더 자동 무시
            </p>
            {questions.length > 0 && (
              <p className="mt-1 text-xs text-green-600">
                {questions.length}문항 정답이 로드되었습니다.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleNextStep}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {questions.length > 0 ? "다음: 정답 확인" : "다음: 정답 입력"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">정답 입력</h1>
      <p className="mb-6 text-sm text-gray-900">
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
              <label className="mb-1 block text-xs font-medium text-gray-900">
                {q.questionNumber}번
              </label>
              <select
                value={q.correctAnswer}
                onChange={(e) => updateAnswer(i, parseInt(e.target.value))}
                className="w-full rounded border px-2 py-1.5 text-center text-sm text-black focus:border-blue-500 focus:outline-none"
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
            className="rounded-lg border px-6 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
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
