"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface SubmissionDetail {
  id: string;
  score: number | null;
  totalPoints: number | null;
  submittedAt: string;
  assignment: { id: string; title: string; totalQuestions: number; analysisPublished: boolean };
  answers: { questionNumber: number; studentAnswer: number; isCorrect: boolean }[];
}

interface StudentDetail {
  id: string;
  name: string | null;
  email: string;
  school: string | null;
  grade: string | null;
  classDay: string | null;
  classTime: string | null;
  submissions: SubmissionDetail[];
}

interface StudentAnalysis {
  title: string;
  score: number;
  totalPoints: number;
  correctRate: number;
  grade: number;
  rank: number;
  totalStudents: number;
  percentile: number;
  wrongQuestions: { questionNumber: number; studentAnswer: number; correctAnswer: number; correctRate: number }[];
  weakPattern: string;
  feedback: string;
  questionBreakdown: {
    questionNumber: number;
    correctAnswer: number;
    studentAnswer: number;
    isCorrect: boolean;
    points: number;
    correctRate: number;
  }[];
  hasAgents: boolean;
}

type Options = Record<string, string[]>;

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.id as string;

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [options, setOptions] = useState<Options>({ school: [], grade: [], classDay: [], classTime: [] });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Analysis state
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<StudentAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editDay, setEditDay] = useState("");
  const [editTime, setEditTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/students/${studentId}`).then((r) => r.json()),
      fetch("/api/admin/class-options").then((r) => r.json()),
    ]).then(([studentData, optionsData]) => {
      setStudent(studentData);
      setOptions(optionsData);
      setLoading(false);
    });
  }, [studentId]);

  function startEditing() {
    if (!student) return;
    setEditName(student.name ?? "");
    setEditSchool(student.school ?? "");
    setEditGrade(student.grade ?? "");
    setEditDay(student.classDay ?? "");
    setEditTime(student.classTime ?? "");
    setEditing(true);
  }

  async function handleSaveEdit() {
    setSaving(true);
    const res = await fetch(`/api/admin/students/${studentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        school: editSchool,
        grade: editGrade,
        classDay: editDay,
        classTime: editTime,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setStudent((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditing(false);
    }
    setSaving(false);
  }

  async function loadAnalysis(assignmentId: string) {
    if (analysisId === assignmentId && analysisData) {
      setAnalysisId(null);
      setAnalysisData(null);
      return;
    }
    setAnalysisId(assignmentId);
    setAnalysisLoading(true);
    setAnalysisData(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/student-analysis?studentId=${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setAnalysisData(data);
      }
    } catch {
      // ignore
    }
    setAnalysisLoading(false);
  }

  if (loading) return <p className="text-gray-900">로딩 중...</p>;
  if (!student) return <p className="text-red-500">학생을 찾을 수 없습니다.</p>;

  const avgScore =
    student.submissions.length > 0
      ? (
          student.submissions.reduce((sum, s) => sum + (s.score ?? 0), 0) /
          student.submissions.length
        ).toFixed(1)
      : "-";

  const classParts = [student.school, student.grade, student.classDay ? `${student.classDay}요일` : null, student.classTime].filter(Boolean);
  const classLabel = classParts.length > 0 ? classParts.join(" / ") : "미배정";

  const gradeColors: Record<number, string> = {
    1: "text-blue-700 bg-blue-50",
    2: "text-blue-600 bg-blue-50",
    3: "text-green-700 bg-green-50",
    4: "text-green-600 bg-green-50",
    5: "text-yellow-700 bg-yellow-50",
    6: "text-yellow-600 bg-yellow-50",
    7: "text-orange-700 bg-orange-50",
    8: "text-red-600 bg-red-50",
    9: "text-red-700 bg-red-50",
  };

  return (
    <div>
      <Link
        href="/admin/students"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        &larr; 학생 목록으로
      </Link>

      <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
        {editing ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">학생 정보 수정</h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-900">이름</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="학교" value={editSchool} onChange={setEditSchool} options={options.school} />
              <EditField label="학년" value={editGrade} onChange={setEditGrade} options={options.grade} />
              <EditField label="수업 요일" value={editDay} onChange={setEditDay} options={options.classDay} />
              <EditField label="수업 시간" value={editTime} onChange={setEditTime} options={options.classTime} />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold">{student.name || student.email}</h1>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-900">
                  <span>{student.email}</span>
                  <span>{classLabel}</span>
                </div>
              </div>
              <button
                onClick={startEditing}
                className="shrink-0 rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                정보 수정
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-900">제출 과제</p>
                <p className="text-2xl font-bold">{student.submissions.length}개</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-900">평균 점수</p>
                <p className="text-2xl font-bold">{avgScore}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-900">반</p>
                <p className="text-sm font-bold">{classLabel}</p>
              </div>
            </div>
          </>
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold">제출 과제 목록</h2>
      <div className="space-y-3">
        {student.submissions.map((sub) => {
          const pct = sub.totalPoints
            ? ((sub.score! / sub.totalPoints) * 100).toFixed(0)
            : "0";
          const isExpanded = expandedId === sub.id;
          const showingAnalysis = analysisId === sub.assignment.id;

          return (
            <div key={sub.id} className="rounded-lg bg-white shadow-sm">
              <div className="flex w-full items-center justify-between px-5 py-4">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                  className="flex flex-1 items-center justify-between text-left"
                >
                  <div>
                    <p className="font-medium">{sub.assignment.title}</p>
                    <p className="mt-0.5 text-xs text-gray-900">
                      {new Date(sub.submittedAt).toLocaleDateString("ko-KR")} 제출
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold">
                        {sub.score}/{sub.totalPoints}
                      </p>
                      <p className="text-xs text-gray-900">{pct}%</p>
                    </div>
                    <span
                      className={`text-gray-900 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    >
                      ▼
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => loadAnalysis(sub.assignment.id)}
                  className={`ml-3 shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    showingAnalysis
                      ? "border-purple-600 bg-purple-50 text-purple-600"
                      : "border-green-600 text-green-600 hover:bg-green-50"
                  }`}
                >
                  {showingAnalysis ? "분석 닫기" : "AI 분석"}
                </button>
              </div>

              {isExpanded && (
                <div className="border-t px-5 py-4">
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                    {sub.answers.map((a) => (
                      <div
                        key={a.questionNumber}
                        className={`rounded-lg p-2 text-center text-xs ${
                          a.isCorrect
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        <span className="block text-[10px] font-medium">
                          {a.questionNumber}번
                        </span>
                        <span className="font-bold">{a.studentAnswer}</span>
                        <span className="block">{a.isCorrect ? "O" : "X"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Analysis Panel */}
              {showingAnalysis && (
                <div className="border-t px-5 py-4">
                  {analysisLoading ? (
                    <p className="text-sm text-gray-900">분석 중...</p>
                  ) : analysisData ? (
                    <div className="space-y-4">
                      {/* Grade & Score Summary */}
                      <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                          <p className="text-xs text-gray-900">점수</p>
                          <p className="text-lg font-bold text-blue-600">
                            {analysisData.score}/{analysisData.totalPoints}
                          </p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                          <p className="text-xs text-gray-900">정답률</p>
                          <p className="text-lg font-bold text-green-600">{analysisData.correctRate}%</p>
                        </div>
                        {analysisData.hasAgents && (
                          <>
                            <div className="rounded-lg bg-gray-50 p-3 text-center">
                              <p className="text-xs text-gray-900">추정 등급</p>
                              <p className={`text-lg font-bold rounded px-2 py-0.5 ${gradeColors[analysisData.grade] || "text-gray-900"}`}>
                                {analysisData.grade}등급
                              </p>
                            </div>
                            <div className="rounded-lg bg-gray-50 p-3 text-center">
                              <p className="text-xs text-gray-900">백분위</p>
                              <p className="text-lg font-bold text-purple-600">
                                상위 {(100 - analysisData.percentile).toFixed(1)}%
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Weak Pattern */}
                      {analysisData.weakPattern && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                          <p className="text-xs font-semibold text-amber-800 mb-1">취약 패턴</p>
                          <p className="text-sm text-amber-700">{analysisData.weakPattern}</p>
                        </div>
                      )}

                      {/* AI Feedback */}
                      <div className="rounded-lg bg-gray-50 p-4">
                        <p className="text-xs font-semibold text-gray-900 mb-2">AI 선생님 코멘트</p>
                        <p className="text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">
                          {analysisData.feedback}
                        </p>
                      </div>

                      {/* Wrong Questions */}
                      {analysisData.wrongQuestions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-900 mb-2">
                            틀린 문항 ({analysisData.wrongQuestions.length}개)
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {analysisData.wrongQuestions.map((q) => (
                              <span
                                key={q.questionNumber}
                                className={`inline-block rounded px-2 py-1 text-xs ${
                                  q.correctRate >= 80
                                    ? "bg-green-100 text-green-700"
                                    : q.correctRate >= 60
                                    ? "bg-blue-100 text-blue-700"
                                    : q.correctRate >= 40
                                    ? "bg-yellow-100 text-yellow-700"
                                    : q.correctRate >= 20
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                                title={`정답률 ${q.correctRate}% | 내답 ${q.studentAnswer} / 정답 ${q.correctAnswer}`}
                              >
                                {q.questionNumber}번 ({q.correctRate}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-900">분석 결과를 불러올 수 없습니다.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {student.submissions.length === 0 && (
          <div className="rounded-lg bg-white px-4 py-12 text-center text-gray-900 shadow-sm">
            아직 제출한 과제가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const allOptions = [...options];
  if (value && !allOptions.includes(value)) {
    allOptions.unshift(value);
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-900">{label}</label>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            const custom = prompt(`${label}을(를) 입력해 주세요:`);
            if (custom) onChange(custom.trim());
          } else {
            onChange(e.target.value);
          }
        }}
        className="w-full rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
      >
        <option value="">선택 안 함</option>
        {allOptions.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value="__custom__">직접 입력...</option>
      </select>
    </div>
  );
}
