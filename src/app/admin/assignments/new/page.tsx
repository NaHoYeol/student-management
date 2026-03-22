"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { distributePoints } from "@/lib/distribute-points";

type QuestionType = "choice" | "multiple" | "subjective";

interface QuestionInput {
  questionNumber: number;
  correctAnswer: string;
  questionType: QuestionType;
  points: number;
}

interface StudentData {
  id: string;
  name: string | null;
  email: string;
  school: string | null;
  grade: string | null;
  classDay: string | null;
  classTime: string | null;
}

function groupLabel(s: StudentData): string {
  const parts = [s.school, s.grade, s.classDay ? `${s.classDay}요일` : null, s.classTime].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "미배정";
}

function questionTypeLabel(type: QuestionType): string {
  switch (type) {
    case "choice": return "객관식";
    case "multiple": return "복수정답";
    case "subjective": return "주관식";
  }
}

export default function NewAssignmentPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState<"OFFICIAL" | "PRIVATE">("PRIVATE");
  const [examDate, setExamDate] = useState("");
  const [questionCount, setQuestionCount] = useState(20);
  const [questions, setQuestions] = useState<QuestionInput[]>([]);
  const [step, setStep] = useState<"info" | "answers">("info");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 할당 대상 관련
  const [targetType, setTargetType] = useState<"ALL" | "CLASS" | "INDIVIDUAL">("ALL");
  const [students, setStudents] = useState<StudentData[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [loadingStudents, setLoadingStudents] = useState(false);

  // 학생 목록 로드 (반/개별 선택 시)
  useEffect(() => {
    if (targetType !== "ALL" && students.length === 0) {
      setLoadingStudents(true);
      fetch("/api/admin/students")
        .then((r) => r.json())
        .then((data) => {
          setStudents(data);
          setLoadingStudents(false);
        })
        .catch(() => setLoadingStudents(false));
    }
  }, [targetType, students.length]);

  // 반 목록 계산
  const classGroups = (() => {
    const groups = new Map<string, StudentData[]>();
    for (const s of students) {
      const key = groupLabel(s);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  function toggleClass(className: string) {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(className)) next.delete(className);
      else next.add(className);
      return next;
    });
  }

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function downloadSampleCSV() {
    const rows = ["문항번호,정답,배점,유형"];
    const pts = distributePoints(questionCount);
    for (let i = 1; i <= questionCount; i++) {
      rows.push(`${i},1,${pts[i - 1]},객관식`);
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
    const parsed: { questionNumber: number; correctAnswer: string; questionType: QuestionType; points: number | null }[] = [];
    let hasExplicitPoints = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && /[가-힣a-zA-Z]/.test(line)) continue;

      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 2) continue;

      const questionNumber = parseInt(cols[0]);
      if (isNaN(questionNumber)) continue;

      const correctAnswer = cols[1];
      if (!correctAnswer) continue;

      const explicitPoints = cols[2] ? parseInt(cols[2]) : null;
      if (explicitPoints !== null && !isNaN(explicitPoints)) hasExplicitPoints = true;

      // 유형 감지: 4번째 컬럼 또는 자동 감지
      let questionType: QuestionType = "choice";
      if (cols[3]) {
        const typeStr = cols[3].toLowerCase();
        if (typeStr.includes("복수") || typeStr === "multiple") questionType = "multiple";
        else if (typeStr.includes("주관") || typeStr === "subjective") questionType = "subjective";
      } else {
        // 자동 감지: 쉼표가 정답에 없으므로 여기서는 안 됨 (CSV 파서 한계)
        // 숫자가 아니면 주관식
        const num = parseInt(correctAnswer);
        if (isNaN(num) || num < 1 || num > 5) questionType = "subjective";
      }

      parsed.push({
        questionNumber,
        correctAnswer,
        questionType,
        points: explicitPoints !== null && !isNaN(explicitPoints) ? explicitPoints : null,
      });
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
          correctAnswer: "1",
          questionType: "choice" as QuestionType,
          points: pts[i],
        }))
      );
    }
    setStep("answers");
    setError("");
  }

  function updateAnswer(index: number, answer: string) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, correctAnswer: answer } : q))
    );
  }

  function updateQuestionType(index: number, type: QuestionType) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        // 유형 변경 시 정답 초기화
        const defaultAnswer = type === "choice" ? "1" : type === "multiple" ? "1,2" : "";
        return { ...q, questionType: type, correctAnswer: defaultAnswer };
      })
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");

    const payload: Record<string, unknown> = {
      title,
      description,
      dueDate: dueDate || undefined,
      category,
      examDate: category === "OFFICIAL" && examDate ? examDate : undefined,
      questions,
      targetType,
    };

    if (targetType === "CLASS") {
      payload.targetClasses = Array.from(selectedClasses);
    } else if (targetType === "INDIVIDUAL") {
      payload.targetStudentIds = Array.from(selectedStudentIds);
    }

    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "과제 생성에 실패했습니다.");
      setSubmitting(false);
      return;
    }

    router.push("/admin/assignments");
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
            <label className="mb-1 block text-sm font-medium text-black">
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
            <label className="mb-1 block text-sm font-medium text-black">
              설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-black">
              과제 유형
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCategory("OFFICIAL"); }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  category === "OFFICIAL"
                    ? "bg-blue-600 text-white"
                    : "border border-gray-300 text-black hover:bg-gray-50"
                }`}
              >
                평가원/교육청 기출
              </button>
              <button
                type="button"
                onClick={() => { setCategory("PRIVATE"); setExamDate(""); }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  category === "PRIVATE"
                    ? "bg-blue-600 text-white"
                    : "border border-gray-300 text-black hover:bg-gray-50"
                }`}
              >
                사설
              </button>
            </div>
            {category === "OFFICIAL" && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-black">
                  모의고사 시행일
                </label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-48 rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">예: 2024년 9월 모의고사 → 2024-09-04</p>
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-black">
              마감일 (선택)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-48 rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">마감일이 지나도 제출은 가능합니다.</p>
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-black">
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

          {/* 할당 대상 설정 */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-black">
              할당 대상
            </label>
            <div className="flex gap-2 mb-3">
              {([
                { value: "ALL", label: "전체" },
                { value: "CLASS", label: "반별" },
                { value: "INDIVIDUAL", label: "개별 학생" },
              ] as { value: typeof targetType; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTargetType(opt.value)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    targetType === opt.value
                      ? "bg-blue-600 text-white"
                      : "border border-gray-300 text-black hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {targetType === "CLASS" && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs text-black">할당할 반을 선택하세요:</p>
                {loadingStudents ? (
                  <p className="text-sm text-black">학생 목록 로딩 중...</p>
                ) : classGroups.length === 0 ? (
                  <p className="text-sm text-black">등록된 학생이 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {classGroups.map(([className, classStudents]) => (
                      <label
                        key={className}
                        className="flex items-center gap-2 rounded p-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedClasses.has(className)}
                          onChange={() => toggleClass(className)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-black">{className}</span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          {classStudents.length}명
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedClasses.size > 0 && (
                  <p className="mt-2 text-xs text-green-600">
                    {selectedClasses.size}개 반 선택됨
                  </p>
                )}
              </div>
            )}

            {targetType === "INDIVIDUAL" && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs text-black">할당할 학생을 선택하세요:</p>
                {loadingStudents ? (
                  <p className="text-sm text-black">학생 목록 로딩 중...</p>
                ) : students.length === 0 ? (
                  <p className="text-sm text-black">등록된 학생이 없습니다.</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {students.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 rounded p-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(s.id)}
                          onChange={() => toggleStudent(s.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-black">
                          {s.name || s.email}
                        </span>
                        <span className="text-xs text-black">
                          {groupLabel(s)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedStudentIds.size > 0 && (
                  <p className="mt-2 text-xs text-green-600">
                    {selectedStudentIds.size}명 선택됨
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mb-6 rounded-lg border-2 border-dashed border-gray-300 p-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-black">
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
              className="block w-full text-sm text-black file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
            />
            <p className="mt-2 text-xs text-black">
              양식: 문항번호,정답,배점,유형 — 유형: 객관식/복수정답/주관식 (생략 시 자동 감지)
            </p>
            <p className="mt-1 text-xs text-black">
              예: 1,3,5,객관식 | 2,&quot;1,3&quot;,5,복수정답 | 3,서울,5,주관식
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
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">정답 입력</h1>
      <p className="mb-6 text-sm text-black">
        {title} — {questionCount}문항
      </p>

      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.questionNumber} className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
              <span className="w-12 shrink-0 text-sm font-bold text-black">{q.questionNumber}번</span>

              {/* 유형 선택 */}
              <select
                value={q.questionType}
                onChange={(e) => updateQuestionType(i, e.target.value as QuestionType)}
                className="shrink-0 rounded border px-2 py-1.5 text-xs text-black focus:border-blue-500 focus:outline-none"
              >
                <option value="choice">객관식</option>
                <option value="multiple">복수정답</option>
                <option value="subjective">주관식</option>
              </select>

              {/* 정답 입력 */}
              {q.questionType === "choice" ? (
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateAnswer(i, String(n))}
                      className={`h-9 w-9 rounded-lg text-sm font-bold transition ${
                        q.correctAnswer === String(n)
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-gray-100 text-black hover:bg-gray-200"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : q.questionType === "multiple" ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const selected = q.correctAnswer.split(",").map((x) => x.trim()).includes(String(n));
                      return (
                        <button
                          key={n}
                          onClick={() => {
                            const current = q.correctAnswer.split(",").map((x) => x.trim()).filter(Boolean);
                            const strN = String(n);
                            const next = selected
                              ? current.filter((x) => x !== strN)
                              : [...current, strN].sort();
                            updateAnswer(i, next.join(","));
                          }}
                          className={`h-9 w-9 rounded-lg text-sm font-bold transition ${
                            selected
                              ? "bg-indigo-600 text-white shadow-md"
                              : "bg-gray-100 text-black hover:bg-gray-200"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs text-black">({q.correctAnswer || "선택"})</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={q.correctAnswer}
                  onChange={(e) => updateAnswer(i, e.target.value)}
                  placeholder="정답을 입력하세요"
                  className="flex-1 rounded-lg border px-3 py-1.5 text-sm text-black focus:border-blue-500 focus:outline-none"
                />
              )}

              <span className="ml-auto shrink-0 text-xs text-black">{q.points}점</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setStep("info")}
            className="rounded-lg border px-6 py-2 text-sm font-medium text-black hover:bg-gray-50"
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
