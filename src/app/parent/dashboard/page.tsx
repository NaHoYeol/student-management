"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface MyLink {
  id: string;
  status: string;
  student: { id: string; name: string | null; school: string | null; grade: string | null } | null;
}

interface AssignmentResult {
  assignmentId: string;
  title: string;
  description: string | null;
  totalQuestions: number;
  createdAt: string;
  instructorName: string | null;
  score: number | null;
  totalPoints: number | null;
  submittedAt: string;
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [links, setLinks] = useState<MyLink[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [assignments, setAssignments] = useState<AssignmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/parent/link")
      .then((r) => r.json())
      .then((data) => {
        const approved = (data as MyLink[]).filter((l) => l.status === "APPROVED" && l.student);
        setLinks(approved);
        if (approved.length === 0) {
          router.replace("/parent/setup");
          return;
        }
        // Auto-select first child
        setSelectedChild(approved[0].student!.id);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  useEffect(() => {
    if (!selectedChild) return;
    setAssignmentsLoading(true);
    fetch(`/api/parent/student-assignments?studentId=${selectedChild}`)
      .then((r) => r.json())
      .then((data) => {
        setAssignments(data);
        setAssignmentsLoading(false);
      })
      .catch(() => setAssignmentsLoading(false));
  }, [selectedChild]);

  if (loading) return <p className="text-black">로딩 중...</p>;

  const currentChild = links.find((l) => l.student?.id === selectedChild);

  // Summary stats
  const totalSubmitted = assignments.length;
  const scores = assignments
    .filter((a) => a.score != null && a.totalPoints)
    .map((a) => Math.round((a.score! / a.totalPoints!) * 100));
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">학부모 대시보드</h1>

      {/* 자녀 선택 */}
      {links.length > 1 && (
        <div className="mb-4">
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="rounded-lg border border-gray-300 p-2 text-sm"
          >
            {links.map((l) => (
              <option key={l.student!.id} value={l.student!.id}>
                {l.student!.name || "이름 없음"} ({l.student!.school} {l.student!.grade})
              </option>
            ))}
          </select>
        </div>
      )}

      {currentChild && (
        <p className="mb-4 text-sm text-gray-600">
          {currentChild.student?.name}님의 과제 현황
        </p>
      )}

      {/* 통계 */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-black">제출 과제</p>
          <p className="text-2xl font-bold text-blue-600">{totalSubmitted}개</p>
        </div>
        <div className="rounded-lg bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-black">평균 점수</p>
          <p className="text-2xl font-bold text-green-600">{avgScore != null ? `${avgScore}점` : "-"}</p>
        </div>
      </div>

      {/* 과제 목록 */}
      {assignmentsLoading ? (
        <p className="text-black">과제 목록을 불러오는 중...</p>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const pct = a.totalPoints ? Math.round((a.score! / a.totalPoints) * 100) : null;
            return (
              <Link
                key={a.assignmentId}
                href={`/parent/analysis?assignmentId=${a.assignmentId}&studentId=${selectedChild}`}
                className="block rounded-lg bg-white p-4 shadow-sm hover:bg-gray-50 active:bg-gray-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {a.totalQuestions}문항 | {a.instructorName || "강사"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(a.submittedAt).toLocaleDateString("ko-KR")} 제출
                    </p>
                  </div>
                  {pct != null && (
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-blue-600">{pct}점</p>
                      <p className="text-xs text-black">{a.score}/{a.totalPoints}</p>
                    </div>
                  )}
                </div>
                <div className="mt-2 text-right">
                  <span className="text-sm font-medium text-purple-600">분석 보기 →</span>
                </div>
              </Link>
            );
          })}
          {assignments.length === 0 && (
            <p className="py-12 text-center text-black">
              아직 제출된 과제가 없습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
