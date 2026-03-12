"use client";

import { useEffect, useState } from "react";

interface StudentData {
  id: string;
  name: string | null;
  email: string;
  submissions: {
    id: string;
    score: number | null;
    totalPoints: number | null;
    assignment: { title: string };
  }[];
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/students")
      .then((res) => res.json())
      .then((data) => {
        setStudents(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">로딩 중...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">학생 관리</h1>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">이름</th>
              <th className="px-4 py-3 font-medium text-gray-600">이메일</th>
              <th className="px-4 py-3 font-medium text-gray-600">제출 과제 수</th>
              <th className="px-4 py-3 font-medium text-gray-600">평균 점수</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const avgScore =
                s.submissions.length > 0
                  ? (
                      s.submissions.reduce(
                        (sum, sub) => sum + (sub.score ?? 0),
                        0
                      ) / s.submissions.length
                    ).toFixed(1)
                  : "-";
              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{s.name || "-"}</td>
                  <td className="px-4 py-3 text-gray-500">{s.email}</td>
                  <td className="px-4 py-3">{s.submissions.length}개</td>
                  <td className="px-4 py-3">{avgScore}</td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  등록된 학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
