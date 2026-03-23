"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CategoryFilter = "ALL" | "OFFICIAL" | "PRIVATE";

interface AssignmentListItem {
  id: string;
  title: string;
  description: string | null;
  totalQuestions: number;
  createdAt: string;
  dueDate: string | null;
  category: string;
  examDate: string | null;
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
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");

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

  // 마감일 1개월 초과 미제출 과제 제외
  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  const visibleAssignments = assignments.filter((a) => {
    const submitted = submissionMap.has(a.id);
    if (submitted) return true;
    if (!a.dueDate) return true;
    return Date.now() - new Date(a.dueDate).getTime() < ONE_MONTH_MS;
  });

  // 요약 통계
  const submittedCount = submissionMap.size;
  const pendingCount = visibleAssignments.length - submittedCount;
  const scores = Array.from(submissionMap.values())
    .filter((s) => s.score != null && s.totalPoints)
    .map((s) => Math.round((s.score! / s.totalPoints!) * 100));
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return (
    <div>
      {/* 요약 통계 */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:mb-6 sm:gap-4">
        <div className="rounded-lg bg-white p-3 shadow-sm text-center sm:p-4">
          <p className="text-xs text-black">제출</p>
          <p className="text-xl font-bold text-blue-600 sm:text-2xl">{submittedCount}개</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm text-center sm:p-4">
          <p className="text-xs text-black">미제출</p>
          <p className="text-xl font-bold sm:text-2xl">{pendingCount > 0 ? `${pendingCount}개` : "-"}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm text-center sm:p-4">
          <p className="text-xs text-black">평균</p>
          <p className="text-xl font-bold text-green-600 sm:text-2xl">{avgScore != null ? `${avgScore}점` : "-"}</p>
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="mb-3 flex gap-2">
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

      <div className="grid gap-3 sm:gap-4">
        {(() => {
          let filtered = categoryFilter === "ALL"
            ? visibleAssignments
            : visibleAssignments.filter((a) => a.category === categoryFilter);

          if (categoryFilter === "OFFICIAL") {
            filtered = [...filtered].sort((a, b) => {
              const da = a.examDate ? new Date(a.examDate).getTime() : 0;
              const db = b.examDate ? new Date(b.examDate).getTime() : 0;
              return db - da;
            });
          }

          return filtered;
        })().map((a) => {
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
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{a.title}</h3>
                        {a.category === "OFFICIAL" && (
                          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">기출</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-black">
                        {a.totalQuestions}문항 | {a.createdBy.name || "강사"}
                        {a.category === "OFFICIAL" && a.examDate && (
                          <span className="ml-1">| 시행 {new Date(a.examDate).toLocaleDateString("ko-KR")}</span>
                        )}
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
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{a.title}</h3>
                      {a.category === "OFFICIAL" && (
                        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">기출</span>
                      )}
                    </div>
                    {a.description && (
                      <p className="mt-1 text-sm text-black">{a.description}</p>
                    )}
                    <p className="mt-1 text-xs text-black">
                      {a.totalQuestions}문항 | {a.createdBy.name || "강사"}
                      {a.category === "OFFICIAL" && a.examDate && (
                        <span className="ml-1">| 시행 {new Date(a.examDate).toLocaleDateString("ko-KR")}</span>
                      )}
                      {a.dueDate && (
                        <span className="ml-1">
                          | 마감 {new Date(a.dueDate).toLocaleDateString("ko-KR")}
                        </span>
                      )}
                    </p>
                    {(() => {
                      if (!a.dueDate) return null;
                      const overdueDays = Math.floor((Date.now() - new Date(a.dueDate).getTime()) / (1000 * 60 * 60 * 24));
                      if (overdueDays <= 0) return null;
                      return (
                        <p className="mt-1 text-xs font-medium text-red-600">
                          마감일 {overdueDays > 30 ? "한달 이상" : `${overdueDays}일`} 초과
                        </p>
                      );
                    })()}
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
        {(() => {
          const filtered = categoryFilter === "ALL"
            ? visibleAssignments
            : visibleAssignments.filter((a) => a.category === categoryFilter);
          if (filtered.length > 0) return null;
          return (
            <p className="py-12 text-center text-black">
              {categoryFilter === "ALL"
                ? "현재 등록된 과제가 없습니다."
                : `${categoryFilter === "OFFICIAL" ? "평가원/교육청" : "사설"} 과제가 없습니다.`}
            </p>
          );
        })()}
      </div>
    </div>
  );
}
