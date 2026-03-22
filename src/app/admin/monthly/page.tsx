"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface MonthItem {
  month: string;
  label: string;
  assignmentCount: number;
  eligibleStudentCount: number;
  status: string;
}

interface WeeklyTimelineEntry {
  weekLabel: string;
  dueDate: string;
  avgCorrectRate: number;
  avgGrade: number | null;
  assignments: {
    title: string;
    correctRate: number;
    score: number;
    totalPoints: number;
    grade: number | null;
    wrongCount: number;
    wrongQuestions: { questionNumber: number; studentAnswer: string; correctAnswer: string; correctRate: number }[];
    correctHighlights: { questionNumber: number; correctRate: number }[];
  }[];
}

interface StudentAnalysis {
  avgCorrectRate: number;
  avgGrade: number | null;
  avgPercentile: number | null;
  assignmentCount: number;
  bestAssignment: { title: string; correctRate: number } | null;
  worstAssignment: { title: string; correctRate: number } | null;
  difficultyRates: { hard: number | null; mid: number | null; easy: number | null };
  trend: { correctRate: number | null; grade: number | null };
  weeklyTimeline?: WeeklyTimelineEntry[];
  aiFeedback?: string;
  assignments: {
    title: string;
    category: string;
    correctRate: number;
    grade: number | null;
    percentile: number | null;
  }[];
}

interface StudentDetail {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  submissionCount: number;
  analysis: StudentAnalysis | null;
}

interface MonthDetail {
  month: string;
  label: string;
  assignmentCount: number;
  assignments: { id: string; title: string }[];
  status: string;
  students: StudentDetail[];
}

function TrendBadge({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null || value === 0) return <span className="text-xs text-gray-400">-</span>;
  const isGood = inverse ? value < 0 : value > 0;
  return (
    <span className={`text-xs font-medium ${isGood ? "text-green-600" : "text-red-600"}`}>
      {isGood ? "▲" : "▼"} {Math.abs(value)}{inverse ? "등급" : "%p"}
    </span>
  );
}

function DifficultyBar({ label, rate, color }: { label: string; rate: number | null; color: string }) {
  if (rate === null) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-[10px] font-medium text-gray-600">{label}</span>
      <div className="flex-1 h-4 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(rate, 2)}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-bold text-gray-700">{rate}%</span>
    </div>
  );
}

const statusLabel: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "미분석", cls: "bg-gray-100 text-gray-600" },
  ANALYZED: { text: "분석 완료", cls: "bg-yellow-100 text-yellow-700" },
  PUBLISHED: { text: "게시됨", cls: "bg-green-100 text-green-700" },
};

export default function AdminMonthlyPage() {
  const [months, setMonths] = useState<MonthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [detail, setDetail] = useState<MonthDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/monthly-reports")
      .then((r) => r.json())
      .then((d) => { setMonths(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function toggleMonth(monthKey: string) {
    if (expandedMonth === monthKey) {
      setExpandedMonth(null);
      setDetail(null);
      setExpandedStudent(null);
      return;
    }
    setExpandedMonth(monthKey);
    setDetailLoading(true);
    setExpandedStudent(null);
    try {
      const res = await fetch(`/api/admin/monthly-reports/${monthKey}`);
      const d = await res.json();
      setDetail(d);
    } catch {
      setDetail(null);
    }
    setDetailLoading(false);
  }

  async function handleAction(monthKey: string, action: "analyze" | "publish") {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/monthly-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthKey, action }),
      });
      if (res.ok) {
        // 목록 갱신
        const listRes = await fetch("/api/admin/monthly-reports");
        setMonths(await listRes.json());
        // 상세 갱신
        const detailRes = await fetch(`/api/admin/monthly-reports/${monthKey}`);
        setDetail(await detailRes.json());
      } else {
        const err = await res.json();
        alert(err.error || "오류가 발생했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    }
    setActionLoading(false);
  }

  if (loading) return <p className="text-black">로딩 중...</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">월별 성취도 관리</h1>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        마감일 기준으로 월별 과제가 그룹핑됩니다. 마감일이 다른 과제를 2회 이상 제출한 학생만 분석 대상입니다.
      </p>

      {months.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-black">마감일이 설정된 과제가 없습니다.</p>
          <p className="mt-1 text-sm text-gray-500">과제에 마감일을 설정하면 월별 분석이 가능합니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...months].reverse().map((m) => {
            const isExpanded = expandedMonth === m.month;
            const sl = statusLabel[m.status] || statusLabel.PENDING;

            return (
              <div key={m.month} className="rounded-lg bg-white shadow-sm">
                {/* 월 헤더 */}
                <button
                  onClick={() => toggleMonth(m.month)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
                >
                  <div>
                    <p className="text-lg font-semibold">{m.label} 성취도</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      과제 {m.assignmentCount}개 · 대상 학생 {m.eligibleStudentCount}명
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${sl.cls}`}>
                      {sl.text}
                    </span>
                    <span className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </div>
                </button>

                {/* 확장 영역 */}
                {isExpanded && (
                  <div className="border-t px-5 py-4">
                    {detailLoading ? (
                      <p className="text-sm text-black">로딩 중...</p>
                    ) : !detail ? (
                      <p className="text-sm text-red-500">데이터를 불러올 수 없습니다.</p>
                    ) : (
                      <div className="space-y-4">
                        {/* 과제 목록 */}
                        <div>
                          <p className="mb-2 text-xs font-semibold text-gray-600">해당 월 과제</p>
                          <div className="flex flex-wrap gap-2">
                            {detail.assignments.map((a) => (
                              <span key={a.id} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-700">
                                {a.title}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* 액션 버튼 */}
                        <div className="flex items-center gap-3">
                          {detail.status === "PENDING" && (
                            <button
                              onClick={() => handleAction(m.month, "analyze")}
                              disabled={actionLoading || detail.students.length === 0}
                              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {actionLoading ? "분석 중..." : "분석 시작"}
                            </button>
                          )}
                          {detail.status === "ANALYZED" && (
                            <>
                              <button
                                onClick={() => handleAction(m.month, "analyze")}
                                disabled={actionLoading}
                                className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                              >
                                {actionLoading ? "분석 중..." : "재분석"}
                              </button>
                              <button
                                onClick={() => handleAction(m.month, "publish")}
                                disabled={actionLoading}
                                className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {actionLoading ? "처리 중..." : "게시"}
                              </button>
                            </>
                          )}
                          {detail.status === "PUBLISHED" && (
                            <>
                              <button
                                onClick={() => handleAction(m.month, "analyze")}
                                disabled={actionLoading}
                                className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                              >
                                {actionLoading ? "분석 중..." : "재분석"}
                              </button>
                              <span className="text-sm text-green-600 font-medium">학생에게 공개됨</span>
                            </>
                          )}

                          {detail.students.length === 0 && detail.status === "PENDING" && (
                            <span className="text-sm text-gray-400">대상 학생이 없습니다</span>
                          )}
                        </div>

                        {/* 학생 목록 */}
                        {detail.students.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-semibold text-gray-600">
                              대상 학생 ({detail.students.length}명)
                            </p>
                            <div className="space-y-2">
                              {detail.students.map((s) => {
                                const isStudentExpanded = expandedStudent === s.id;
                                const a = s.analysis;
                                return (
                                  <div key={s.id} className="rounded-lg border">
                                    <button
                                      onClick={() => setExpandedStudent(isStudentExpanded ? null : s.id)}
                                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="font-medium text-sm">{s.name}</span>
                                        {s.school && (
                                          <span className="text-xs text-gray-500">{s.school}</span>
                                        )}
                                        {s.grade && (
                                          <span className="text-xs text-gray-500">{s.grade}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {a ? (
                                          <>
                                            <span className="text-sm font-bold text-blue-600">{a.avgCorrectRate}%</span>
                                            {a.avgGrade !== null && (
                                              <span className="text-xs text-gray-500">{a.avgGrade}등급</span>
                                            )}
                                            <TrendBadge value={a.trend.correctRate} />
                                          </>
                                        ) : (
                                          <span className="text-xs text-gray-400">미분석</span>
                                        )}
                                        <span className={`text-gray-400 text-xs transition-transform ${isStudentExpanded ? "rotate-180" : ""}`}>
                                          ▼
                                        </span>
                                      </div>
                                    </button>

                                    {isStudentExpanded && a && (
                                      <div className="border-t px-4 py-3 space-y-3">
                                        {/* 요약 */}
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                          <div className="rounded-lg bg-blue-50 p-2.5 text-center">
                                            <p className="text-[10px] text-blue-600">평균 정답률</p>
                                            <p className="text-sm font-bold text-blue-700">{a.avgCorrectRate}%</p>
                                          </div>
                                          {a.avgGrade !== null && (
                                            <div className="rounded-lg bg-green-50 p-2.5 text-center">
                                              <p className="text-[10px] text-green-600">추정 등급</p>
                                              <p className="text-sm font-bold text-green-700">{a.avgGrade}등급</p>
                                            </div>
                                          )}
                                          {a.avgPercentile !== null && (
                                            <div className="rounded-lg bg-purple-50 p-2.5 text-center">
                                              <p className="text-[10px] text-purple-600">백분위</p>
                                              <p className="text-sm font-bold text-purple-700">상위 {(100 - a.avgPercentile).toFixed(1)}%</p>
                                            </div>
                                          )}
                                          <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                                            <p className="text-[10px] text-gray-600">과제 수</p>
                                            <p className="text-sm font-bold">{a.assignmentCount}개</p>
                                          </div>
                                        </div>

                                        {/* 주차별 정답률 시계열 그래프 */}
                                        {a.weeklyTimeline && a.weeklyTimeline.length >= 2 && (
                                          <div className="rounded-lg border p-3">
                                            <p className="mb-2 text-[10px] font-semibold text-gray-600">주차별 정답률 추이</p>
                                            <div className="flex items-end gap-1" style={{ height: 80 }}>
                                              {a.weeklyTimeline.map((w, wi) => {
                                                const h = (w.avgCorrectRate / 100) * 100;
                                                const prevRate = wi > 0 ? a.weeklyTimeline![wi - 1].avgCorrectRate : null;
                                                const diff = prevRate !== null ? w.avgCorrectRate - prevRate : null;
                                                return (
                                                  <div key={wi} className="flex flex-1 flex-col items-center gap-0.5">
                                                    <span className="text-[9px] font-bold text-gray-700">{w.avgCorrectRate}%</span>
                                                    {diff !== null && (
                                                      <span className={`text-[8px] ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                        {diff >= 0 ? "+" : ""}{diff}
                                                      </span>
                                                    )}
                                                    <div
                                                      className={`w-full rounded-t ${
                                                        diff === null ? "bg-blue-400" : diff >= 0 ? "bg-blue-500" : "bg-orange-400"
                                                      }`}
                                                      style={{ height: `${Math.max(h, 5)}%` }}
                                                    />
                                                    <span className="text-[8px] text-gray-500 truncate w-full text-center">
                                                      {w.weekLabel}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                            {/* 주차별 상세 */}
                                            <div className="mt-2 space-y-1.5">
                                              {a.weeklyTimeline.map((w, wi) => (
                                                <div key={wi} className="rounded bg-gray-50 px-2.5 py-1.5">
                                                  <p className="text-[10px] font-medium text-gray-700">{w.weekLabel}</p>
                                                  {w.assignments.map((wa, wai) => (
                                                    <div key={wai} className="mt-1 flex items-center justify-between">
                                                      <span className="text-[10px] text-gray-600 truncate">{wa.title}</span>
                                                      <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-[10px] font-bold text-blue-600">{wa.correctRate}%</span>
                                                        {wa.wrongCount > 0 && (
                                                          <span className="text-[9px] text-red-500">오답 {wa.wrongCount}개</span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* 난이도별 */}
                                        <div>
                                          <p className="mb-1.5 text-[10px] font-semibold text-gray-600">난이도별 정답률</p>
                                          <div className="space-y-1">
                                            <DifficultyBar label="상" rate={a.difficultyRates.hard} color="bg-red-400" />
                                            <DifficultyBar label="중" rate={a.difficultyRates.mid} color="bg-yellow-400" />
                                            <DifficultyBar label="하" rate={a.difficultyRates.easy} color="bg-green-400" />
                                          </div>
                                        </div>

                                        {/* AI 선생님 분석 */}
                                        {a.aiFeedback && (
                                          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                                            <p className="mb-2 text-xs font-semibold text-indigo-800">AI 선생님 월간 분석</p>
                                            <div className="text-xs leading-relaxed text-indigo-900 whitespace-pre-wrap prose prose-xs max-w-none">
                                              {a.aiFeedback}
                                            </div>
                                          </div>
                                        )}

                                        {/* 학생 상세 링크 */}
                                        <Link
                                          href={`/admin/students/${s.id}`}
                                          className="inline-block text-xs text-blue-600 hover:underline"
                                        >
                                          학생 상세 보기 &rarr;
                                        </Link>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
