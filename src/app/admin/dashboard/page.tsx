"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AssignmentSummary {
  id: string;
  title: string;
  totalQuestions: number;
  createdAt: string;
  _count: { submissions: number };
}

export default function AdminDashboard() {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assignments")
      .then((res) => res.json())
      .then((data) => {
        setAssignments(data);
        setLoading(false);
      });
  }, []);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}" 과제를 삭제하시겠습니까?\n관련된 모든 제출 데이터도 함께 삭제됩니다.`)) {
      return;
    }
    const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } else {
      alert("삭제에 실패했습니다.");
    }
  }

  if (loading) {
    return <p className="text-gray-500">로딩 중...</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">강사 대시보드</h1>
        <Link
          href="/admin/assignments/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 새 과제 만들기
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">전체 과제</p>
          <p className="text-3xl font-bold">{assignments.length}</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">총 제출 수</p>
          <p className="text-3xl font-bold">
            {assignments.reduce((sum, a) => sum + a._count.submissions, 0)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">활성 과제</p>
          <p className="text-3xl font-bold">{assignments.length}</p>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">최근 과제</h2>
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">제목</th>
              <th className="px-4 py-3 font-medium text-gray-600">문항 수</th>
              <th className="px-4 py-3 font-medium text-gray-600">제출 수</th>
              <th className="px-4 py-3 font-medium text-gray-600">생성일</th>
              <th className="px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/assignments?id=${a.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {a.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{a.totalQuestions}문항</td>
                <td className="px-4 py-3">{a._count.submissions}명</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(a.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(a.id, a.title)}
                    className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  아직 등록된 과제가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
