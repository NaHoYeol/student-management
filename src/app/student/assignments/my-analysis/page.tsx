"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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
  cached?: boolean;
}

function MyAnalysisContent() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("id");
  const [data, setData] = useState<StudentAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!assignmentId) {
      setLoading(false);
      return;
    }
    fetch(`/api/assignments/${assignmentId}/student-analysis`)
      .then((r) => {
        if (!r.ok) throw r;
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(async (r) => {
        try {
          if (r.json) {
            const d = await r.json();
            setError(
              d.error === "Not published"
                ? "아직 분석 결과가 공개되지 않았습니다."
                : d.error === "No submission"
                ? "이 과제에 대한 제출 기록이 없습니다."
                : d.error || "분석 결과를 불러올 수 없습니다."
            );
          } else {
            setError("분석 결과를 불러올 수 없습니다.");
          }
        } catch {
          setError("분석 결과를 불러올 수 없습니다.");
        }
        setLoading(false);
      });
  }, [assignmentId]);

  if (loading) return <p className="text-gray-500">분석 결과를 불러오는 중...</p>;

  if (!assignmentId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">과제를 선택해 주세요.</p>
        <Link href="/student/assignments" className="mt-4 text-blue-600 hover:underline">
          과제 목록으로
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="mb-4 text-gray-500">{error}</p>
        <Link href="/student/assignments" className="text-blue-600 hover:underline">
          과제 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  if (!data) return null;

  function handlePrint() {
    window.print();
  }

  const gradeColors: Record<number, string> = {
    1: "text-blue-700 bg-blue-50 border-blue-200",
    2: "text-blue-600 bg-blue-50 border-blue-200",
    3: "text-green-700 bg-green-50 border-green-200",
    4: "text-green-600 bg-green-50 border-green-200",
    5: "text-yellow-700 bg-yellow-50 border-yellow-200",
    6: "text-yellow-600 bg-yellow-50 border-yellow-200",
    7: "text-orange-700 bg-orange-50 border-orange-200",
    8: "text-red-600 bg-red-50 border-red-200",
    9: "text-red-700 bg-red-50 border-red-200",
  };

  return (
    <div id="my-analysis-report">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href="/student/assignments"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; 과제 목록으로
        </Link>
        <button
          onClick={handlePrint}
          className="rounded-lg border border-gray-400 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          PDF 다운로드
        </button>
      </div>

      <h1 className="mb-1 text-2xl font-bold">{data.title} - 내 성적 분석</h1>
      <p className="mb-4 text-xs text-gray-400">전국 단위 9등급제 기반 추정 결과</p>

      {/* 요약 카드 */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-gray-400">점수</p>
          <p className="text-2xl font-bold text-blue-600">
            {data.score}<span className="text-sm font-normal text-gray-400">/{data.totalPoints}</span>
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-gray-400">정답률</p>
          <p className="text-2xl font-bold text-green-600">{data.correctRate}%</p>
        </div>
        {data.hasAgents && (
          <>
            <div className="rounded-lg bg-white p-4 shadow-sm text-center">
              <p className="text-xs text-gray-400">추정 등급</p>
              <p className={`inline-block rounded-lg border px-3 py-1 text-2xl font-bold ${gradeColors[data.grade] || "text-gray-600"}`}>
                {data.grade}등급
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm text-center">
              <p className="text-xs text-gray-400">백분위</p>
              <p className="text-2xl font-bold text-purple-600">
                상위 {(100 - data.percentile).toFixed(1)}%
              </p>
            </div>
          </>
        )}
      </div>

      {/* AI 피드백 */}
      <div className="mb-6 rounded-lg bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">AI 선생님 코멘트</h2>
        <div className="rounded-lg bg-gray-50 p-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
          {data.feedback}
        </div>
      </div>

      {/* 취약 패턴 */}
      {data.weakPattern && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <h3 className="mb-1 text-sm font-semibold text-amber-800">취약 패턴 분석</h3>
          <p className="text-sm text-amber-700">{data.weakPattern}</p>
        </div>
      )}

      {/* 문항별 결과 */}
      <div className="mb-6 rounded-lg bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">문항별 결과</h2>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {data.questionBreakdown.map((q) => (
            <div
              key={q.questionNumber}
              className={`rounded-lg border p-2 text-center ${
                q.isCorrect
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <span className="block text-xs text-gray-400">{q.questionNumber}</span>
              <span className={`text-sm font-bold ${q.isCorrect ? "text-green-600" : "text-red-600"}`}>
                {q.isCorrect ? "O" : "X"}
              </span>
              {!q.isCorrect && (
                <span className="block text-xs text-gray-400">
                  {q.studentAnswer}&rarr;{q.correctAnswer}
                </span>
              )}
              {q.correctRate !== undefined && (
                <span className="block text-[10px] text-gray-400">
                  {q.correctRate}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 틀린 문항 목록 */}
      {data.wrongQuestions.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">
            틀린 문항 ({data.wrongQuestions.length}개)
          </h2>
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2 font-medium text-gray-600">문항</th>
                <th className="px-4 py-2 font-medium text-gray-600">내 답</th>
                <th className="px-4 py-2 font-medium text-gray-600">정답</th>
                <th className="px-4 py-2 font-medium text-gray-600">정답률</th>
                <th className="px-4 py-2 font-medium text-gray-600">난이도</th>
              </tr>
            </thead>
            <tbody>
              {data.wrongQuestions.map((q) => (
                <tr key={q.questionNumber} className="border-b last:border-0">
                  <td className="px-4 py-2">{q.questionNumber}번</td>
                  <td className="px-4 py-2 text-red-600 font-medium">{q.studentAnswer}</td>
                  <td className="px-4 py-2 text-green-600 font-medium">{q.correctAnswer}</td>
                  <td className="px-4 py-2 text-gray-600">{q.correctRate}%</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      q.correctRate >= 80
                        ? "bg-green-100 text-green-700"
                        : q.correctRate >= 60
                        ? "bg-blue-100 text-blue-700"
                        : q.correctRate >= 40
                        ? "bg-yellow-100 text-yellow-700"
                        : q.correctRate >= 20
                        ? "bg-orange-100 text-orange-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {q.correctRate >= 80 ? "상" : q.correctRate >= 60 ? "중상" : q.correctRate >= 40 ? "중" : q.correctRate >= 20 ? "중하" : "하"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function MyAnalysisPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">로딩 중...</p>}>
      <MyAnalysisContent />
    </Suspense>
  );
}
