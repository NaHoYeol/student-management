"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Submission {
  id: string;
  score: number | null;
  totalPoints: number | null;
  submittedAt: string;
  student: { name: string | null; email: string };
  answers: { questionNumber: number; studentAnswer: number; isCorrect: boolean }[];
}

interface Assignment {
  id: string;
  title: string;
  totalQuestions: number;
  questions: { questionNumber: number; correctAnswer: number; points: number }[];
}

function AssignmentsContent() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("id");
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assignmentId) {
      setLoading(false);
      return;
    }

    Promise.all([
      fetch(`/api/assignments/${assignmentId}`).then((r) => r.json()),
      fetch(`/api/submissions?assignmentId=${assignmentId}`).then((r) => r.json()),
    ]).then(([a, s]) => {
      setAssignment(a);
      setSubmissions(s);
      setLoading(false);
    });
  }, [assignmentId]);

  if (loading) return <p className="text-gray-500">로딩 중...</p>;

  if (!assignmentId || !assignment) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">대시보드에서 과제를 선택해 주세요.</p>
        <Link href="/admin/dashboard" className="mt-4 text-blue-600 hover:underline">
          대시보드로 이동
        </Link>
      </div>
    );
  }

  const avgScore =
    submissions.length > 0
      ? (
          submissions.reduce((sum, s) => sum + (s.score ?? 0), 0) /
          submissions.length
        ).toFixed(1)
      : "-";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{assignment.title}</h1>
        <p className="text-sm text-gray-500">
          {assignment.totalQuestions}문항 | 제출 {submissions.length}명 | 평균 점수{" "}
          {avgScore}점
        </p>
      </div>

      <h2 className="mb-3 text-lg font-semibold">정답표</h2>
      <div className="mb-8 grid grid-cols-10 gap-2 rounded-lg bg-white p-4 shadow-sm">
        {assignment.questions.map((q) => (
          <div key={q.questionNumber} className="text-center">
            <span className="block text-xs text-gray-400">{q.questionNumber}</span>
            <span className="text-sm font-bold text-blue-600">{q.correctAnswer}</span>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">제출 현황</h2>
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">학생</th>
              <th className="px-4 py-3 font-medium text-gray-600">점수</th>
              <th className="px-4 py-3 font-medium text-gray-600">정답률</th>
              <th className="px-4 py-3 font-medium text-gray-600">제출일</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-4 py-3">{s.student.name || s.student.email}</td>
                <td className="px-4 py-3 font-medium">
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
                  아직 제출한 학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">로딩 중...</p>}>
      <AssignmentsContent />
    </Suspense>
  );
}
