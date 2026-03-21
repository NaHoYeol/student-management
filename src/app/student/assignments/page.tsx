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
  score: number | null;
  totalPoints: number | null;
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
      if (Array.isArray(submissionList)) {
        for (const s of submissionList) {
          if (s.assignment?.id) map.set(s.assignment.id, s);
        }
      }
      setSubmissionMap(map);
      setLoading(false);
    }).catch(() => {
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
          const score = submission?.score;
          const totalPoints = submission?.totalPoints;
          const pct = totalPoints ? Math.round((score! / totalPoints) * 100) : null;

          return (
            <div key={a.id} className="rounded-lg bg-white shadow-sm overflow-hidden">
              {done ? (
                /* 제출 완료: 카드 전체가 내 분석으로 이동 */
                <Link
                  href={`/student/assignments/my-analysis?id=${a.id}`}
                  className="block p-4 sm:p-5 active:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{a.title}</h3>
                      <p className="mt-1 text-xs text-black">
                        {a.totalQuestions}문항 | {a.createdBy.name || "강사"}
                      </p>
                    </div>
                    {/* 점수 표시 */}
                    <div className="shrink-0 text-right">
                      {score != null && totalPoints != null ? (
                        <>
                          <p className="text-lg font-bold text-blue-600">{pct}점</p>
                          <p className="text-xs text-black">{score}/{totalPoints}</p>
                        </>
                      ) : (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                          제출 완료
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 하단 안내 */}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      제출 완료
                    </span>
                    <span className="text-sm font-medium text-blue-600">
                      내 분석 보기 &rarr;
                    </span>
                  </div>
                </Link>
              ) : (
                /* 미제출: 카드 전체가 풀기로 이동 */
                <Link
                  href={`/student/assignments/${a.id}`}
                  className="block p-4 sm:p-5 active:bg-gray-50"
                >
                  <div className="mb-3">
                    <h3 className="font-semibold">{a.title}</h3>
                    {a.description && (
                      <p className="mt-1 text-sm text-black">{a.description}</p>
                    )}
                    <p className="mt-1 text-xs text-black">
                      {a.totalQuestions}문항 | {a.createdBy.name || "강사"}
                    </p>
                  </div>
                  <span className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white">
                    풀기
                  </span>
                </Link>
              )}

              {/* 제출 완료 시 추가 액션 버튼들 */}
              {done && (
                <div className="flex border-t">
                  {canResubmit && (
                    <Link
                      href={`/student/assignments/${a.id}?edit=true`}
                      className="flex-1 border-r py-3 text-center text-sm font-medium text-orange-600 active:bg-orange-50"
                    >
                      재제출
                    </Link>
                  )}
                  {a.analysisPublished && (
                    <Link
                      href={`/student/assignments/analysis?id=${a.id}`}
                      className="flex-1 py-3 text-center text-sm font-medium text-purple-600 active:bg-purple-50"
                    >
                      전체 분석
                    </Link>
                  )}
                </div>
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
