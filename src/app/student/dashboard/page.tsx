"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SubmissionSummary {
  id: string;
  score: number | null;
  totalPoints: number | null;
  submittedAt: string;
  assignment: { id: string; title: string; totalQuestions: number };
}

export default function StudentDashboard() {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/submissions")
      .then((res) => res.json())
      .then((data) => {
        setSubmissions(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-black">로딩 중...</p>;

  const totalSubmitted = submissions.length;
  const avgScore =
    totalSubmitted > 0
      ? (
          submissions.reduce((sum, s) => sum + (s.score ?? 0), 0) /
          totalSubmitted
        ).toFixed(1)
      : "-";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">내 대시보드</h1>
        <Link
          href="/student/assignments"
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 sm:w-auto sm:py-2"
        >
          과제 풀러 가기
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs text-black sm:text-sm">제출한 과제</p>
          <p className="text-2xl font-bold sm:text-3xl">{totalSubmitted}개</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs text-black sm:text-sm">평균 점수</p>
          <p className="text-2xl font-bold sm:text-3xl">{avgScore}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs text-black sm:text-sm">진척도</p>
          <p className="text-2xl font-bold text-green-600 sm:text-3xl">
            {totalSubmitted > 0 ? "진행 중" : "시작 전"}
          </p>
        </div>
      </div>

      <h2 className="mb-3 mt-6 text-lg font-semibold sm:mt-8">최근 제출 내역</h2>

      {/* 모바일: 카드 레이아웃 */}
      <div className="space-y-2 sm:hidden">
        {submissions.map((s) => (
          <div key={s.id} className="rounded-lg bg-white p-4 shadow-sm">
            <p className="font-medium">{s.assignment.title}</p>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-bold text-blue-600">{s.score}/{s.totalPoints}</span>
              <span>{s.totalPoints ? ((s.score! / s.totalPoints) * 100).toFixed(0) : 0}%</span>
              <span className="text-xs text-black">{new Date(s.submittedAt).toLocaleDateString("ko-KR")}</span>
            </div>
          </div>
        ))}
        {submissions.length === 0 && (
          <div className="rounded-lg bg-white px-4 py-8 text-center text-black shadow-sm">
            아직 제출한 과제가 없습니다.
          </div>
        )}
      </div>

      {/* 데스크탑: 테이블 레이아웃 */}
      <div className="hidden overflow-hidden rounded-lg bg-white shadow-sm sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-black">과제명</th>
              <th className="px-4 py-3 font-medium text-black">점수</th>
              <th className="px-4 py-3 font-medium text-black">정답률</th>
              <th className="px-4 py-3 font-medium text-black">제출일</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{s.assignment.title}</td>
                <td className="px-4 py-3">
                  {s.score}/{s.totalPoints}
                </td>
                <td className="px-4 py-3">
                  {s.totalPoints
                    ? ((s.score! / s.totalPoints) * 100).toFixed(0)
                    : 0}
                  %
                </td>
                <td className="px-4 py-3 text-black">
                  {new Date(s.submittedAt).toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
            {submissions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-black">
                  아직 제출한 과제가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
