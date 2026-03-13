"use client";

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

export function AnalysisReport({
  title,
  analysis,
  hideCount = false,
}: {
  title: string;
  analysis: AnalysisResult;
  hideCount?: boolean;
}) {
  const a = analysis;
  const maxBandRate = Math.max(...a.scoreBands.map((b) => b.rate), 1);
  const maxBandCount = Math.max(...a.scoreBands.map((b) => b.count), 1);
  const maxChoiceRate = 100;

  return (
    <div id="analysis-report" className="space-y-8">
      {/* 헤더 */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {hideCount
            ? `성적 분석 리포트 | ${a.totalQuestions}문항 | 만점 ${a.totalPoints}점`
            : `성적 분석 리포트 | 응시 ${a.totalStudents}명 | ${a.totalQuestions}문항 | 만점 ${a.totalPoints}점`
          }
        </p>
        {hideCount && (
          <p className="mt-0.5 text-xs text-gray-400">
            전국 단위 9등급제 기반 추정 결과
          </p>
        )}
      </div>

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
                <span className="w-20 shrink-0 text-right text-xs text-gray-500">
                  {b.label}점
                </span>
                <div className="flex-1">
                  <Bar
                    value={hideCount ? b.rate : b.count}
                    max={hideCount ? maxBandRate : maxBandCount}
                    color="bg-blue-500"
                  />
                </div>
                <span className="w-16 shrink-0 text-xs text-gray-600">
                  {hideCount
                    ? `${b.rate.toFixed(1)}%`
                    : `${b.count}명 (${b.rate.toFixed(0)}%)`
                  }
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
                <span className="w-12 shrink-0 text-right text-xs font-medium text-gray-500">
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
                <span className="w-16 shrink-0 text-xs text-gray-600">
                  {q.correctRate.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 오답률 높은 문항 TOP 5 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">오답률 높은 문항 TOP 5</h2>
        <div className="rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">문항</th>
                <th className="px-4 py-3 font-medium text-gray-600">정답</th>
                <th className="px-4 py-3 font-medium text-gray-600">정답률</th>
                <th className="px-4 py-3 font-medium text-gray-600">1번</th>
                <th className="px-4 py-3 font-medium text-gray-600">2번</th>
                <th className="px-4 py-3 font-medium text-gray-600">3번</th>
                <th className="px-4 py-3 font-medium text-gray-600">4번</th>
                <th className="px-4 py-3 font-medium text-gray-600">5번</th>
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
                      className={`px-4 py-3 ${i + 1 === q.correctAnswer ? "font-bold text-blue-600" : "text-gray-500"}`}
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
                <th className="px-4 py-3 font-medium text-gray-600">문항</th>
                <th className="px-4 py-3 font-medium text-gray-600">정답</th>
                <th className="px-4 py-3 font-medium text-gray-600">정답률</th>
                <th className="px-4 py-3 font-medium text-gray-600">1번</th>
                <th className="px-4 py-3 font-medium text-gray-600">2번</th>
                <th className="px-4 py-3 font-medium text-gray-600">3번</th>
                <th className="px-4 py-3 font-medium text-gray-600">4번</th>
                <th className="px-4 py-3 font-medium text-gray-600">5번</th>
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
                      className={`px-4 py-3 ${i + 1 === q.correctAnswer ? "font-bold text-blue-600" : "text-gray-500"}`}
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
      {label && <p className="text-xs text-gray-500">{label}</p>}
      <p className={`font-bold ${sub ? "text-sm text-gray-600" : "text-xl"}`}>{value}</p>
    </div>
  );
}
