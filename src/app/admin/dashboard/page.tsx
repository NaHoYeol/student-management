"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CategoryFilter = "ALL" | "OFFICIAL" | "PRIVATE";

interface AssignmentSummary {
  id: string;
  title: string;
  totalQuestions: number;
  createdAt: string;
  dueDate: string | null;
  category: string;
  examDate: string | null;
  _count: { submissions: number };
}

export default function AdminDashboard() {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");

  useEffect(() => {
    Promise.all([
      fetch("/api/assignments").then((res) => res.json()),
      fetch("/api/admin/students").then((res) => res.json()),
    ]).then(([assignmentData, studentData]) => {
      setAssignments(assignmentData);
      setStudentCount(Array.isArray(studentData) ? studentData.length : 0);
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
    return <p className="text-black">로딩 중...</p>;
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

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-black">전체 과제</p>
          <p className="text-3xl font-bold">{assignments.length}</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-black">총 제출 수</p>
          <p className="text-3xl font-bold">
            {assignments.reduce((sum, a) => sum + a._count.submissions, 0)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-black">등록 학생</p>
          <p className="text-3xl font-bold">{studentCount}명</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-black">마감 초과 과제</p>
          <p className="text-3xl font-bold text-red-600">
            {assignments.filter((a) => a.dueDate && new Date(a.dueDate) < new Date()).length}
          </p>
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="mb-3 mt-8 flex items-center gap-2">
        {([
          { value: "ALL", label: "전체 (등록일순)" },
          { value: "OFFICIAL", label: "평가원/교육청" },
          { value: "PRIVATE", label: "사설" },
        ] as { value: CategoryFilter; label: string }[]).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setCategoryFilter(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              categoryFilter === tab.value
                ? "bg-blue-600 text-white"
                : "border border-gray-300 text-black hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-black">제목</th>
              <th className="px-4 py-3 font-medium text-black">유형</th>
              <th className="px-4 py-3 font-medium text-black">문항 수</th>
              <th className="px-4 py-3 font-medium text-black">제출</th>
              <th className="px-4 py-3 font-medium text-black">미제출</th>
              <th className="px-4 py-3 font-medium text-black">
                {categoryFilter === "OFFICIAL" ? "시행일" : "마감일"}
              </th>
              <th className="px-4 py-3 font-medium text-black"></th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let filtered = categoryFilter === "ALL"
                ? assignments
                : assignments.filter((a) => a.category === categoryFilter);

              if (categoryFilter === "OFFICIAL") {
                filtered = [...filtered].sort((a, b) => {
                  const da = a.examDate ? new Date(a.examDate).getTime() : 0;
                  const db = b.examDate ? new Date(b.examDate).getTime() : 0;
                  return db - da;
                });
              }

              return filtered.map((a) => {
                const unsubmitted = Math.max(0, studentCount - a._count.submissions);
                const isOverdue = a.dueDate && new Date(a.dueDate) < new Date();
                const overdueDays = a.dueDate
                  ? Math.floor((Date.now() - new Date(a.dueDate).getTime()) / (1000 * 60 * 60 * 24))
                  : 0;

                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/assignments?id=${a.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.category === "OFFICIAL"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {a.category === "OFFICIAL" ? "기출" : "사설"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{a.totalQuestions}문항</td>
                    <td className="px-4 py-3">{a._count.submissions}명</td>
                    <td className="px-4 py-3">
                      {unsubmitted > 0 ? (
                        <span className="font-medium text-red-600">{unsubmitted}명</span>
                      ) : (
                        <span className="text-green-600">전원 제출</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {categoryFilter === "OFFICIAL" ? (
                        a.examDate ? (
                          <span className="text-black">
                            {new Date(a.examDate).toLocaleDateString("ko-KR")}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )
                      ) : a.dueDate ? (
                        <div>
                          <span className={isOverdue ? "text-red-600 font-medium" : "text-black"}>
                            {new Date(a.dueDate).toLocaleDateString("ko-KR")}
                          </span>
                          {isOverdue && overdueDays > 0 && unsubmitted > 0 && (
                            <span className="ml-1 text-xs text-red-500">({overdueDays}일 초과)</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
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
                );
              });
            })()}
            {(() => {
              const filtered = categoryFilter === "ALL"
                ? assignments
                : assignments.filter((a) => a.category === categoryFilter);
              if (filtered.length > 0) return null;
              return (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-black">
                    {categoryFilter === "ALL"
                      ? "아직 등록된 과제가 없습니다."
                      : `${categoryFilter === "OFFICIAL" ? "평가원/교육청" : "사설"} 과제가 없습니다.`}
                  </td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
