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

  if (loading) return <p className="text-gray-500">로딩 중...</p>;

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">내 대시보드</h1>
        <Link
          href="/student/assignments"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          과제 풀러 가기
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">제출한 과제</p>
          <p className="text-3xl font-bold">{totalSubmitted}개</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">평균 점수</p>
          <p className="text-3xl font-bold">{avgScore}</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">진척도</p>
          <p className="text-3xl font-bold text-green-600">
            {totalSubmitted > 0 ? "진행 중" : "시작 전"}
          </p>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">최근 제출 내역</h2>
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">과제명</th>
              <th className="px-4 py-3 font-medium text-gray-600">점수</th>
              <th className="px-4 py-3 font-medium text-gray-600">정답률</th>
              <th className="px-4 py-3 font-medium text-gray-600">제출일</th>
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
                <td className="px-4 py-3 text-gray-500">
                  {new Date(s.submittedAt).toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
            {submissions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
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
