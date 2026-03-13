"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AssignmentListItem {
  id: string;
  title: string;
  description: string | null;
  totalQuestions: number;
  createdAt: string;
  analysisPublished: boolean;
  createdBy: { name: string | null };
}

interface SubmissionInfo {
  id: string;
  resubmitApproved: boolean;
  assignment: { id: string };
}

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [submissionMap, setSubmissionMap] = useState<Map<string, SubmissionInfo>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/assignments").then((r) => r.json()),
      fetch("/api/submissions").then((r) => r.json()),
    ]).then(([assignmentList, submissionList]) => {
      setAssignments(assignmentList);
      const map = new Map<string, SubmissionInfo>();
      for (const s of submissionList as SubmissionInfo[]) {
        map.set(s.assignment.id, s);
      }
      setSubmissionMap(map);
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-black">로딩 중...</p>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold sm:mb-6 sm:text-2xl">과제 목록</h1>

      <div className="grid gap-3 sm:gap-4">
        {assignments.map((a) => {
          const submission = submissionMap.get(a.id);
          const done = !!submission;
          const canResubmit = submission?.resubmitApproved === true;

          return (
            <div
              key={a.id}
              className="rounded-lg bg-white p-4 shadow-sm sm:p-5"
            >
              {/* 상단: 과제 정보 */}
              <div className="mb-3">
                <h3 className="font-semibold">{a.title}</h3>
                {a.description && (
                  <p className="mt-1 text-sm text-black">{a.description}</p>
                )}
                <p className="mt-1 text-xs text-black">
                  {a.totalQuestions}문항 | {a.createdBy.name || "강사"}
                </p>
              </div>

              {/* 하단: 버튼 영역 */}
              {done ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                    제출 완료
                  </span>
                  {canResubmit ? (
                    <Link
                      href={`/student/assignments/${a.id}?edit=true`}
                      className="rounded-lg border border-orange-500 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 active:bg-orange-100"
                    >
                      재제출 (승인됨)
                    </Link>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-black">
                      수정 불가
                    </span>
                  )}
                  {a.analysisPublished && (
                    <>
                      <Link
                        href={`/student/assignments/analysis?id=${a.id}`}
                        className="rounded-lg border border-purple-600 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 active:bg-purple-100"
                      >
                        분석 결과
                      </Link>
                      <Link
                        href={`/student/assignments/my-analysis?id=${a.id}`}
                        className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 active:bg-green-100"
                      >
                        내 분석
                      </Link>
                    </>
                  )}
                </div>
              ) : (
                <Link
                  href={`/student/assignments/${a.id}`}
                  className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
                >
                  풀기
                </Link>
              )}
            </div>
          );
        })}
        {assignments.length === 0 && (
          <p className="py-12 text-center text-black">
            현재 등록된 과제가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
