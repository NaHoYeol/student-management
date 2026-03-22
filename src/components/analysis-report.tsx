"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/statistics";

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-3 w-full rounded-full bg-gray-100">
      <div
        className={`h-3 rounded-full ${color}`}
        style={{ width: `${Math.max(pct, 1)}%` }}
      />
    </div>
  );
}

const gradeColors: Record<number, string> = {
  1: "bg-blue-100 text-blue-800",
  2: "bg-blue-50 text-blue-700",
  3: "bg-green-100 text-green-800",
  4: "bg-green-50 text-green-700",
  5: "bg-yellow-100 text-yellow-800",
  6: "bg-yellow-50 text-yellow-700",
  7: "bg-orange-100 text-orange-800",
  8: "bg-red-50 text-red-700",
  9: "bg-red-100 text-red-800",
};

export function AnalysisReport({
  title,
  analysis,
  hideCount = false,
  realStudentCount,
}: {
  title: string;
  analysis: AnalysisResult;
  hideCount?: boolean;
  realStudentCount?: number;
}) {
  const a = analysis;
  const maxBandRate = Math.max(...a.scoreBands.map((b) => b.rate), 1);
  const maxChoiceRate = 100;

  const [showAllChoices, setShowAllChoices] = useState(false);

  return (
    <div id="analysis-report" className="space-y-8">
      {/* 헤더 */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-black">
          {hideCount
            ? `성적 분석 리포트 | ${a.totalQuestions}문항 | 만점 ${a.totalPoints}점`
            : `성적 분석 리포트 | 응시 ${realStudentCount ?? a.totalStudents}명 | ${a.totalQuestions}문항 | 만점 ${a.totalPoints}점`
          }
        </p>
        {hideCount && (
          <p className="mt-0.5 text-xs text-black">
            전국 단위 9등급제 기반 추정 결과
          </p>
        )}
      </div>

      {/* 등급컷 */}
      {a.gradeCutoffs && a.gradeCutoffs.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">등급컷</h2>
          <div className="rounded-lg bg-white shadow-sm overflow-hidden">
            <table className="w-full text-center text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  {a.gradeCutoffs.map((c) => (
                    <th key={c.grade} className="px-2 py-3 font-medium text-black">
                      {c.grade}등급
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  {a.gradeCutoffs.map((c) => (
                    <td key={c.grade} className="px-2 py-3">
                      <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${gradeColors[c.grade] || ""}`}>
                        {c.minScore === c.maxScore
                          ? `${c.minScore}점`
                          : `${c.minScore}~${c.maxScore}점`
                        }
                      </span>
                    </td>
                  ))}
                </tr>
                {!hideCount && (
                  <tr>
                    {a.gradeCutoffs.map((c) => {
                      const pct = a.totalStudents > 0
                        ? ((c.count / a.totalStudents) * 100).toFixed(0)
                        : "0";
                      return (
                        <td key={c.grade} className="px-2 py-2 text-xs text-black">
                          {pct}%
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs text-black">
            9등급 누적비율: 4% / 11% / 23% / 40% / 60% / 77% / 89% / 96% / 100%
          </p>
        </div>
      )}

      {/* 기초통계량 카드 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">기초통계량</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="평균" value={`${a.mean}점`} />
          <StatCard label="중앙값" value={`${a.median}점`} />
          <StatCard label="최빈값" value={a.mode.length <= 3 ? a.mode.join(", ") + "점" : `${a.mode[0]}점 외 ${a.mode.length - 1}개`} />
          <StatCard label="표준편차" value={`${a.stdDev}`} />
          <StatCard label="최고점" value={`${a.max}점`} />
          <StatCard label="최저점" value={`${a.min}점`} />
          <StatCard label="범위" value={`${a.range}점`} />
          <StatCard label="IQR" value={`${a.iqr} (Q1:${a.q1} Q3:${a.q3})`} sub />
        </div>
      </div>

      {/* 기술통계량 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">기술통계량</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="왜도 (Skewness)" value={`${a.skewness}`} />
          <StatCard
            label=""
            value={
              a.skewness > 0.5
                ? "오른쪽 꼬리 (저점수 집중)"
                : a.skewness < -0.5
                  ? "왼쪽 꼬리 (고점수 집중)"
                  : "대칭에 가까움"
            }
            sub
          />
          <StatCard label="첨도 (Kurtosis)" value={`${a.kurtosis}`} />
          <StatCard
            label=""
            value={
              a.kurtosis > 1
                ? "뾰족 (점수 밀집)"
                : a.kurtosis < -1
                  ? "평평 (점수 분산)"
                  : "정규분포에 가까움"
            }
            sub
          />
        </div>
      </div>

      {/* 점수 분포 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">점수 분포</h2>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="space-y-2">
            {a.scoreBands.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-right text-xs text-black">
                  {b.label}점
                </span>
                <div className="flex-1">
                  <Bar
                    value={b.rate}
                    max={maxBandRate}
                    color="bg-blue-500"
                  />
                </div>
                <span className="w-16 shrink-0 text-xs text-black">
                  {b.rate.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 문항별 정답률 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">문항별 정답률</h2>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="space-y-2">
            {a.questionStats.map((q) => (
              <div key={q.questionNumber} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-right text-xs font-medium text-black">
                  {q.questionNumber}번
                </span>
                <div className="flex-1">
                  <Bar
                    value={q.correctRate}
                    max={maxChoiceRate}
                    color={
                      q.correctRate >= 80
                        ? "bg-green-500"
                        : q.correctRate >= 50
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }
                  />
                </div>
                <span className="w-16 shrink-0 text-xs text-black">
                  {q.correctRate.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 문항별 선지 분포 (전체) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">문항별 선지 분포</h2>
          <button
            onClick={() => setShowAllChoices(!showAllChoices)}
            className="text-xs font-medium text-blue-600 hover:underline print:hidden"
          >
            {showAllChoices ? "접기" : "펼치기"}
          </button>
        </div>
        {showAllChoices && (
          <div className="rounded-lg bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-3 font-medium text-black">문항</th>
                  <th className="px-3 py-3 font-medium text-black">정답</th>
                  <th className="px-3 py-3 font-medium text-black">정답률</th>
                  <th className="px-3 py-3 font-medium text-black text-center">1번</th>
                  <th className="px-3 py-3 font-medium text-black text-center">2번</th>
                  <th className="px-3 py-3 font-medium text-black text-center">3번</th>
                  <th className="px-3 py-3 font-medium text-black text-center">4번</th>
                  <th className="px-3 py-3 font-medium text-black text-center">5번</th>
                </tr>
              </thead>
              <tbody>
                {a.questionStats.map((q) => {
                  // 정답 아닌 선지 중 가장 많이 선택된 선지 찾기
                  let maxWrongIdx = -1;
                  let maxWrongRate = 0;
                  const correctNums = String(q.correctAnswer).split(",").map((x) => parseInt(x.trim()));
                  q.choiceRates.forEach((r, i) => {
                    if (!correctNums.includes(i + 1) && r > maxWrongRate) {
                      maxWrongRate = r;
                      maxWrongIdx = i;
                    }
                  });

                  return (
                    <tr key={q.questionNumber} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium">{q.questionNumber}번</td>
                      <td className="px-3 py-2.5 font-bold text-blue-600">{q.correctAnswer}</td>
                      <td className={`px-3 py-2.5 font-medium ${
                        q.correctRate >= 80 ? "text-green-600"
                          : q.correctRate >= 50 ? "text-yellow-600"
                          : "text-red-600"
                      }`}>
                        {q.correctRate.toFixed(1)}%
                      </td>
                      {q.choiceRates.map((r, i) => (
                        <td
                          key={i}
                          className={`px-3 py-2.5 text-center ${
                            String(q.correctAnswer).split(",").map((x) => parseInt(x.trim())).includes(i + 1)
                              ? "font-bold text-blue-600"
                              : i === maxWrongIdx && maxWrongRate >= 20
                                ? "font-medium text-red-500"
                                : "text-black"
                          }`}
                        >
                          {r.toFixed(0)}%
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 오답률 높은 문항 TOP 5 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">오답률 높은 문항 TOP 5</h2>
        <div className="rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-black">문항</th>
                <th className="px-4 py-3 font-medium text-black">정답</th>
                <th className="px-4 py-3 font-medium text-black">정답률</th>
                <th className="px-4 py-3 font-medium text-black">1번</th>
                <th className="px-4 py-3 font-medium text-black">2번</th>
                <th className="px-4 py-3 font-medium text-black">3번</th>
                <th className="px-4 py-3 font-medium text-black">4번</th>
                <th className="px-4 py-3 font-medium text-black">5번</th>
              </tr>
            </thead>
            <tbody>
              {a.hardestQuestions.map((q) => (
                <tr key={q.questionNumber} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{q.questionNumber}번</td>
                  <td className="px-4 py-3 font-bold text-blue-600">{q.correctAnswer}</td>
                  <td className="px-4 py-3 text-red-600">{q.correctRate.toFixed(1)}%</td>
                  {q.choiceRates.map((r, i) => (
                    <td
                      key={i}
                      className={`px-4 py-3 ${String(q.correctAnswer).split(",").map((x) => parseInt(x.trim())).includes(i + 1) ? "font-bold text-blue-600" : "text-black"}`}
                    >
                      {r.toFixed(0)}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 정답률 높은 문항 TOP 5 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">정답률 높은 문항 TOP 5</h2>
        <div className="rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-black">문항</th>
                <th className="px-4 py-3 font-medium text-black">정답</th>
                <th className="px-4 py-3 font-medium text-black">정답률</th>
                <th className="px-4 py-3 font-medium text-black">1번</th>
                <th className="px-4 py-3 font-medium text-black">2번</th>
                <th className="px-4 py-3 font-medium text-black">3번</th>
                <th className="px-4 py-3 font-medium text-black">4번</th>
                <th className="px-4 py-3 font-medium text-black">5번</th>
              </tr>
            </thead>
            <tbody>
              {a.easiestQuestions.map((q) => (
                <tr key={q.questionNumber} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{q.questionNumber}번</td>
                  <td className="px-4 py-3 font-bold text-blue-600">{q.correctAnswer}</td>
                  <td className="px-4 py-3 text-green-600">{q.correctRate.toFixed(1)}%</td>
                  {q.choiceRates.map((r, i) => (
                    <td
                      key={i}
                      className={`px-4 py-3 ${String(q.correctAnswer).split(",").map((x) => parseInt(x.trim())).includes(i + 1) ? "font-bold text-blue-600" : "text-black"}`}
                    >
                      {r.toFixed(0)}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      {label && <p className="text-xs text-black">{label}</p>}
      <p className={`font-bold ${sub ? "text-sm text-black" : "text-xl"}`}>{value}</p>
    </div>
  );
}
