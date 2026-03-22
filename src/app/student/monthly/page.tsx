"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

interface MonthAnalysis {
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

interface MonthReport {
  month: string;
  label: string;
  publishedAt: string;
  analysis: MonthAnalysis;
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

export default function StudentMonthlyPage() {
  const [reports, setReports] = useState<MonthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/student/monthly-reports")
      .then((r) => r.json())
      .then((d) => { setReports(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-black">로딩 중...</p>;

  // 정답률 추이 차트 데이터 (시간순)
  const sorted = [...reports].reverse(); // API에서 desc로 옴 → reverse해서 오래된 것부터
  const maxRate = Math.max(...sorted.map((r) => r.analysis.avgCorrectRate), 100);

  // 전체 변화
  const first = sorted.length > 0 ? sorted[0] : null;
  const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const overallChange = first && last && sorted.length >= 2
    ? last.analysis.avgCorrectRate - first.analysis.avgCorrectRate
    : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/student/assignments" className="text-sm text-blue-600 hover:underline">
          &larr; 과제 목록으로
        </Link>
      </div>

      <h1 className="mb-1 text-2xl font-bold">월별 학업 성취도</h1>
      <p className="mb-6 text-sm text-gray-500">
        마감일 기준 월별 정답률·추정 등급·난이도별 정답률 추이
      </p>

      {reports.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-black">아직 게시된 월별 분석이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-500">강사가 분석을 게시하면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <>
          {/* 전체 요약 카드 */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-white p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500">분석된 월</p>
              <p className="text-2xl font-bold text-blue-600">{reports.length}개월</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500">최근 평균 정답률</p>
              <p className="text-2xl font-bold text-green-600">
                {last?.analysis.avgCorrectRate ?? "-"}%
              </p>
            </div>
            {last?.analysis.avgGrade !== null && last?.analysis.avgGrade !== undefined && (
              <div className="rounded-lg bg-white p-4 shadow-sm text-center">
                <p className="text-xs text-gray-500">최근 추정 등급</p>
                <p className="text-2xl font-bold">{last.analysis.avgGrade}등급</p>
              </div>
            )}
            <div className="rounded-lg bg-white p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500">전체 변화</p>
              {overallChange !== null ? (
                <p className={`text-2xl font-bold ${overallChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {overallChange >= 0 ? "+" : ""}{overallChange}%p
                </p>
              ) : (
                <p className="text-2xl font-bold text-gray-400">-</p>
              )}
            </div>
          </div>

          {/* 정답률 추이 차트 */}
          {sorted.length >= 2 && (
            <div className="mb-6 rounded-lg bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">정답률 추이</h2>
              <div className="flex items-end gap-1 sm:gap-2" style={{ height: 120 }}>
                {sorted.map((r) => {
                  const h = maxRate > 0 ? (r.analysis.avgCorrectRate / maxRate) * 100 : 0;
                  return (
                    <div key={r.month} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-gray-700">{r.analysis.avgCorrectRate}%</span>
                      <div
                        className="w-full rounded-t bg-blue-500"
                        style={{ height: `${Math.max(h, 3)}%` }}
                      />
                      <span className="text-[9px] text-gray-500 truncate w-full text-center">
                        {r.label.replace(/^\d+년\s*/, "")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 추정 등급 추이 */}
          {sorted.length >= 2 && sorted.some((r) => r.analysis.avgGrade !== null) && (
            <div className="mb-6 rounded-lg bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">추정 등급 추이</h2>
              <div className="flex items-end gap-1 sm:gap-2" style={{ height: 120 }}>
                {sorted.map((r) => {
                  const grade = r.analysis.avgGrade ?? 5;
                  const h = ((10 - grade) / 9) * 100;
                  const gradeColor = grade <= 3 ? "bg-blue-500" : grade <= 6 ? "bg-green-500" : "bg-orange-500";
                  return (
                    <div key={r.month} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-gray-700">
                        {r.analysis.avgGrade !== null ? `${r.analysis.avgGrade}등급` : "-"}
                      </span>
                      <div
                        className={`w-full rounded-t ${gradeColor}`}
                        style={{ height: `${Math.max(h, 5)}%` }}
                      />
                      <span className="text-[9px] text-gray-500 truncate w-full text-center">
                        {r.label.replace(/^\d+년\s*/, "")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 월별 상세 카드 (최신순) */}
          <h2 className="mb-3 text-base font-semibold">월별 상세</h2>
          <div className="space-y-3">
            {reports.map((r) => {
              const a = r.analysis;
              const isExpanded = expandedMonth === r.month;
              return (
                <div key={r.month} className="rounded-lg bg-white shadow-sm">
                  <button
                    onClick={() => setExpandedMonth(isExpanded ? null : r.month)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-semibold">{r.label} 성취도</p>
                      <p className="mt-0.5 text-xs text-gray-500">{a.assignmentCount}개 과제</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-bold text-blue-600">{a.avgCorrectRate}%</p>
                        <TrendBadge value={a.trend.correctRate} />
                      </div>
                      {a.avgGrade !== null && (
                        <div className="text-right">
                          <p className="text-sm font-bold">{a.avgGrade}등급</p>
                          <TrendBadge value={a.trend.grade} inverse />
                        </div>
                      )}
                      <span className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        ▼
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t px-5 py-4 space-y-4">
                      {/* 요약 카드 */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg bg-blue-50 p-3 text-center">
                          <p className="text-[10px] text-blue-600">평균 정답률</p>
                          <p className="text-lg font-bold text-blue-700">{a.avgCorrectRate}%</p>
                        </div>
                        {a.avgGrade !== null && (
                          <div className="rounded-lg bg-green-50 p-3 text-center">
                            <p className="text-[10px] text-green-600">추정 등급</p>
                            <p className="text-lg font-bold text-green-700">{a.avgGrade}등급</p>
                          </div>
                        )}
                        {a.avgPercentile !== null && (
                          <div className="rounded-lg bg-purple-50 p-3 text-center">
                            <p className="text-[10px] text-purple-600">백분위</p>
                            <p className="text-lg font-bold text-purple-700">상위 {(100 - a.avgPercentile).toFixed(1)}%</p>
                          </div>
                        )}
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                          <p className="text-[10px] text-gray-600">과제 수</p>
                          <p className="text-lg font-bold">{a.assignmentCount}개</p>
                        </div>
                      </div>

                      {/* 주차별 정답률 시계열 그래프 */}
                      {a.weeklyTimeline && a.weeklyTimeline.length >= 2 && (
                        <div className="rounded-lg border p-4">
                          <p className="mb-3 text-xs font-semibold text-gray-600">주차별 정답률 추이</p>
                          <div className="flex items-end gap-1 sm:gap-2" style={{ height: 100 }}>
                            {a.weeklyTimeline.map((w, wi) => {
                              const h = (w.avgCorrectRate / 100) * 100;
                              const prevRate = wi > 0 ? a.weeklyTimeline![wi - 1].avgCorrectRate : null;
                              const diff = prevRate !== null ? w.avgCorrectRate - prevRate : null;
                              return (
                                <div key={wi} className="flex flex-1 flex-col items-center gap-0.5">
                                  <span className="text-[10px] font-bold text-gray-700">{w.avgCorrectRate}%</span>
                                  {diff !== null && (
                                    <span className={`text-[9px] font-medium ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                                      {diff >= 0 ? "+" : ""}{diff}
                                    </span>
                                  )}
                                  <div
                                    className={`w-full rounded-t ${
                                      diff === null ? "bg-blue-400" : diff >= 0 ? "bg-blue-500" : "bg-orange-400"
                                    }`}
                                    style={{ height: `${Math.max(h, 5)}%` }}
                                  />
                                  <span className="text-[9px] text-gray-500 truncate w-full text-center">
                                    {w.weekLabel}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* 주차별 과제 상세 */}
                          <div className="mt-3 space-y-2">
                            {a.weeklyTimeline.map((w, wi) => (
                              <div key={wi} className="rounded-lg bg-gray-50 px-3 py-2">
                                <p className="text-xs font-medium text-gray-700 mb-1">{w.weekLabel}</p>
                                {w.assignments.map((wa, wai) => (
                                  <div key={wai} className="flex items-center justify-between py-0.5">
                                    <span className="text-xs text-gray-600 truncate">{wa.title}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-xs font-bold text-blue-600">{wa.score}/{wa.totalPoints} ({wa.correctRate}%)</span>
                                      {wa.wrongCount > 0 && (
                                        <span className="text-[10px] text-red-500">오답 {wa.wrongCount}개</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 난이도별 정답률 */}
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-600">난이도별 정답률</p>
                        <div className="space-y-1.5">
                          <DifficultyBar label="상" rate={a.difficultyRates.hard} color="bg-red-400" />
                          <DifficultyBar label="중" rate={a.difficultyRates.mid} color="bg-yellow-400" />
                          <DifficultyBar label="하" rate={a.difficultyRates.easy} color="bg-green-400" />
                        </div>
                        <p className="mt-1.5 text-[10px] text-gray-400">
                          상: 전체 정답률 40% 미만 | 중: 40~70% | 하: 70% 이상
                        </p>
                      </div>

                      {/* 최고/최저 */}
                      {a.bestAssignment && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-green-50 p-3">
                            <p className="text-[10px] text-green-700">최고 성적</p>
                            <p className="text-sm font-bold text-green-800">{a.bestAssignment.correctRate}%</p>
                            <p className="text-xs text-green-600 truncate">{a.bestAssignment.title}</p>
                          </div>
                          {a.worstAssignment && (
                            <div className="rounded-lg bg-red-50 p-3">
                              <p className="text-[10px] text-red-700">최저 성적</p>
                              <p className="text-sm font-bold text-red-800">{a.worstAssignment.correctRate}%</p>
                              <p className="text-xs text-red-600 truncate">{a.worstAssignment.title}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 과제별 상세 */}
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-600">과제별 결과</p>
                        <div className="space-y-1">
                          {a.assignments.map((asn, i) => (
                            <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {asn.category === "OFFICIAL" && (
                                  <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-700">기출</span>
                                )}
                                <span className="text-sm text-gray-800 truncate">{asn.title}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-sm font-bold text-blue-600">{asn.correctRate}%</span>
                                {asn.grade !== null && (
                                  <span className="text-xs text-gray-500">{asn.grade}등급</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AI 선생님 월간 분석 */}
                      {a.aiFeedback && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                          <p className="mb-2 text-sm font-semibold text-indigo-800">AI 선생님 월간 분석</p>
                          <div className="text-sm leading-relaxed text-indigo-900 whitespace-pre-wrap">
                            {a.aiFeedback}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
