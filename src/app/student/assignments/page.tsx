"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AssignmentListItem {
  id: string;
  title: string;
  description: string | null;
  totalQuestions: number;
  createdAt: string;
  createdBy: { name: string | null };
}

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/assignments").then((r) => r.json()),
      fetch("/api/submissions").then((r) => r.json()),
    ]).then(([assignmentList, submissionList]) => {
      setAssignments(assignmentList);
      setSubmitted(
        new Set(
          submissionList.map(
            (s: { assignment: { id: string } }) => s.assignment.id
          )
        )
      );
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-gray-500">로딩 중...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">과제 목록</h1>

      <div className="grid gap-4">
        {assignments.map((a) => {
          const done = submitted.has(a.id);
          return (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg bg-white p-5 shadow-sm"
            >
              <div>
                <h3 className="font-semibold">{a.title}</h3>
                {a.description && (
                  <p className="mt-1 text-sm text-gray-500">{a.description}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  {a.totalQuestions}문항 | {a.createdBy.name || "강사"}
                </p>
              </div>
              {done ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  제출 완료
                </span>
              ) : (
                <Link
                  href={`/student/assignments/${a.id}`}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  풀기
                </Link>
              )}
            </div>
          );
        })}
        {assignments.length === 0 && (
          <p className="py-12 text-center text-gray-400">
            현재 등록된 과제가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
