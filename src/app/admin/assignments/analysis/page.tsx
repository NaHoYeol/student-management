"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnalysisReport } from "@/components/analysis-report";
import type { AnalysisResult } from "@/lib/statistics";

interface StudentSubmission {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  score: number;
  totalPoints: number;
  correctRate: number;
}

function AnalysisContent() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("id");

  const [title, setTitle] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState(false);

  // Student list for per-student analysis
  const [students, setStudents] = useState<StudentSubmission[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentAnalysis, setStudentAnalysis] = useState<Record<string, unknown> | null>(null);
  const [studentAnalysisLoading, setStudentAnalysisLoading] = useState(false);

  const runAnalysis = useCallback(() => {
    if (!assignmentId) return;
    setLoading(true);
    setError("");
    fetch(`/api/assignments/${assignmentId}/analysis`)
      .then((r) => {
        if (!r.ok) throw r;
        return r.json();
      })
      .then((data) => {
        setTitle(data.title);
        setAnalysis(data.analysis);
        setPublished(data.analysisPublished);
        setLoading(false);
      })
      .catch(async (r) => {
        if (r.json) {
          const data = await r.json();
          setError(data.error === "No submissions" ? "제출된 답안이 없어 분석할 수 없습니다." : data.error);
        } else {
          setError("분석에 실패했습니다.");
        }
        setLoading(false);
      });
  }, [assignmentId]);

  // Load student submissions for this assignment
  useEffect(() => {
    if (!assignmentId || !analysis) return;
    setStudentsLoading(true);
    fetch(`/api/assignments/${assignmentId}/submissions-list`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setStudents(data);
        setStudentsLoading(false);
      })
      .catch(() => setStudentsLoading(false));
  }, [assignmentId, analysis]);

  async function togglePublish() {
    if (!assignmentId) return;
    setToggling(true);
    const res = await fetch(`/api/assignments/${assignmentId}/analysis`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !published }),
    });
    if (res.ok) setPublished(!published);
    setToggling(false);
  }

  async function loadStudentAnalysis(studentId: string) {
    if (selectedStudentId === studentId) {
      setSelectedStudentId(null);
      setStudentAnalysis(null);
      return;
    }
    setSelectedStudentId(studentId);
    setStudentAnalysisLoading(true);
    setStudentAnalysis(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/student-analysis?studentId=${studentId}`);
      if (res.ok) {
        setStudentAnalysis(await res.json());
      }
    } catch {
      // ignore
    }
    setStudentAnalysisLoading(false);
  }

  function handlePrint() {
    window.print();
  }

  if (!assignmentId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-900">대시보드에서 과제를 선택해 주세요.</p>
        <Link href="/admin/dashboard" className="mt-4 text-blue-600 hover:underline">
          대시보드로 이동
        </Link>
      </div>
    );
  }

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
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href={`/admin/assignments?id=${assignmentId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; 과제 상세로
        </Link>
        <div className="flex gap-2">
          {analysis && (
            <>
              <button
                onClick={togglePublish}
                disabled={toggling}
                className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  published
                    ? "border border-red-500 text-red-500 hover:bg-red-50"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {toggling ? "처리 중..." : published ? "게시 해제" : "학생에게 게시"}
              </button>
              <button
                onClick={handlePrint}
                className="rounded-lg border border-gray-400 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                PDF 다운로드
              </button>
            </>
          )}
        </div>
      </div>

      {!analysis && !loading && !error && (
        <div className="text-center py-20">
          <p className="mb-4 text-gray-900">분석하기 버튼을 눌러 성적 분석을 시작하세요.</p>
          <button
            onClick={runAnalysis}
            className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            분석하기
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-20">
          <p className="text-gray-900">분석 중...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-20">
          <p className="mb-4 text-red-500">{error}</p>
          <button
            onClick={runAnalysis}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {analysis && (
        <>
          {published && (
            <div className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 print:hidden">
              이 분석 결과는 학생들에게 공개된 상태입니다.
            </div>
          )}
          <AnalysisReport title={title} analysis={analysis} />

          {/* 학생별 분석 섹션 */}
          <div className="mt-8 print:hidden">
            <h2 className="mb-3 text-lg font-semibold">학생별 분석</h2>
            {studentsLoading ? (
              <p className="text-sm text-gray-900">학생 목록 불러오는 중...</p>
            ) : students.length === 0 ? (
              <p className="text-sm text-gray-900">제출한 학생이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {students.map((s) => (
                  <div key={s.id} className="rounded-lg bg-white shadow-sm">
                    <button
                      onClick={() => loadStudentAnalysis(s.studentId)}
                      className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{s.studentName || s.studentEmail}</span>
                        <span className="text-xs text-gray-900">{s.studentEmail}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold">
                          {s.score}/{s.totalPoints} ({s.correctRate}%)
                        </span>
                        <span className={`text-gray-900 transition-transform ${selectedStudentId === s.studentId ? "rotate-180" : ""}`}>
                          ▼
                        </span>
                      </div>
                    </button>

                    {selectedStudentId === s.studentId && (
                      <div className="border-t px-5 py-4">
                        {studentAnalysisLoading ? (
                          <p className="text-sm text-gray-900">분석 중...</p>
                        ) : studentAnalysis ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-4 gap-3">
                              <div className="rounded-lg bg-gray-50 p-3 text-center">
                                <p className="text-xs text-gray-900">점수</p>
                                <p className="text-lg font-bold text-blue-600">
                                  {(studentAnalysis as { score: number }).score}/{(studentAnalysis as { totalPoints: number }).totalPoints}
                                </p>
                              </div>
                              <div className="rounded-lg bg-gray-50 p-3 text-center">
                                <p className="text-xs text-gray-900">정답률</p>
                                <p className="text-lg font-bold text-green-600">{(studentAnalysis as { correctRate: number }).correctRate}%</p>
                              </div>
                              {(studentAnalysis as { hasAgents: boolean }).hasAgents && (
                                <>
                                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                                    <p className="text-xs text-gray-900">추정 등급</p>
                                    <p className={`text-lg font-bold rounded px-2 py-0.5 ${gradeColors[(studentAnalysis as { grade: number }).grade] || ""}`}>
                                      {(studentAnalysis as { grade: number }).grade}등급
                                    </p>
                                  </div>
                                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                                    <p className="text-xs text-gray-900">백분위</p>
                                    <p className="text-lg font-bold text-purple-600">
                                      상위 {(100 - (studentAnalysis as { percentile: number }).percentile).toFixed(1)}%
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>

                            {(studentAnalysis as { weakPattern: string }).weakPattern && (
                              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                                <p className="text-xs font-semibold text-amber-800 mb-1">취약 패턴</p>
                                <p className="text-sm text-amber-700">{(studentAnalysis as { weakPattern: string }).weakPattern}</p>
                              </div>
                            )}

                            <div className="rounded-lg bg-gray-50 p-4">
                              <p className="text-xs font-semibold text-gray-900 mb-2">AI 선생님 코멘트</p>
                              <p className="text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">
                                {(studentAnalysis as { feedback: string }).feedback}
                              </p>
                            </div>

                            {((studentAnalysis as { wrongQuestions: { questionNumber: number; correctRate: number; studentAnswer: number; correctAnswer: number }[] }).wrongQuestions).length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-gray-900 mb-2">
                                  틀린 문항 ({((studentAnalysis as { wrongQuestions: unknown[] }).wrongQuestions).length}개)
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {((studentAnalysis as { wrongQuestions: { questionNumber: number; correctRate: number; studentAnswer: number; correctAnswer: number }[] }).wrongQuestions).map((q) => (
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
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminAnalysisPage() {
  return (
    <Suspense fallback={<p className="text-gray-900">로딩 중...</p>}>
      <AnalysisContent />
    </Suspense>
  );
}
