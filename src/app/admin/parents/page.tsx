"use client";

import { useEffect, useState } from "react";

interface Student {
  id: string;
  name: string | null;
  school: string | null;
  grade: string | null;
}

interface ParentLink {
  id: string;
  status: string;
  studentName: string | null;
  schoolName: string | null;
  gradeName: string | null;
  createdAt: string;
  parent: { id: string; name: string | null; email: string };
  student: Student | null;
}

export default function AdminParentsPage() {
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  // PENDING 링크별 선택된 학생 ID
  const [selectedStudents, setSelectedStudents] = useState<Record<string, string>>({});
  // APPROVED 링크 수정 모드: linkId → 선택된 studentId
  const [editingLinks, setEditingLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/parent-links").then((r) => r.json()),
      fetch("/api/admin/students").then((r) => r.json()),
    ])
      .then(([linksData, studentsData]) => {
        setLinks(linksData);
        setStudents(studentsData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleApprove(linkId: string) {
    const studentId = selectedStudents[linkId];
    if (!studentId) {
      alert("연결할 학생을 선택해주세요.");
      return;
    }

    const res = await fetch(`/api/admin/parent-links/${linkId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED", studentId }),
    });

    if (res.ok) {
      const connectedStudent = students.find((s) => s.id === studentId);
      setLinks((prev) =>
        prev.map((l) =>
          l.id === linkId ? { ...l, status: "APPROVED", student: connectedStudent || null } : l
        )
      );
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "승인 처리에 실패했습니다.");
    }
  }

  async function handleReject(linkId: string) {
    const res = await fetch(`/api/admin/parent-links/${linkId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED" }),
    });

    if (res.ok) {
      setLinks((prev) => prev.map((l) => (l.id === linkId ? { ...l, status: "REJECTED" } : l)));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "거절 처리에 실패했습니다.");
    }
  }

  function startEdit(linkId: string, currentStudentId: string) {
    setEditingLinks((prev) => ({ ...prev, [linkId]: currentStudentId }));
  }

  function cancelEdit(linkId: string) {
    setEditingLinks((prev) => {
      const next = { ...prev };
      delete next[linkId];
      return next;
    });
  }

  async function saveEdit(linkId: string) {
    const studentId = editingLinks[linkId];
    if (!studentId) {
      alert("연결할 학생을 선택해주세요.");
      return;
    }

    const res = await fetch(`/api/admin/parent-links/${linkId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED", studentId }),
    });

    if (res.ok) {
      const connectedStudent = students.find((s) => s.id === studentId);
      setLinks((prev) =>
        prev.map((l) =>
          l.id === linkId ? { ...l, student: connectedStudent || null } : l
        )
      );
      cancelEdit(linkId);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "수정에 실패했습니다.");
    }
  }

  if (loading) return <p className="text-black">로딩 중...</p>;

  const filtered = filter === "ALL" ? links : links.filter((l) => l.status === filter);

  const pendingCount = links.filter((l) => l.status === "PENDING").length;
  const approvedCount = links.filter((l) => l.status === "APPROVED").length;
  const rejectedCount = links.filter((l) => l.status === "REJECTED").length;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">학부모 관리</h1>

      {/* 통계 */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-black">대기</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-black">승인</p>
          <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-black">거절</p>
          <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex gap-2">
        {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === f ? "bg-blue-600 text-white" : "bg-white text-black hover:bg-gray-100"
            }`}
          >
            {f === "ALL" ? "전체" : f === "PENDING" ? "대기" : f === "APPROVED" ? "승인" : "거절"}
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div className="space-y-3">
        {filtered.map((link) => {
          const displayName = link.student?.name || link.studentName || "이름 없음";
          const displaySchool = link.student?.school || link.schoolName || "";
          const displayGrade = link.student?.grade || link.gradeName || "";

          return (
            <div key={link.id} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {link.parent.name || link.parent.email}
                  </p>
                  <div className="mt-1 rounded-md bg-gray-50 p-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">신청 자녀:</span> {displayName}
                    </p>
                    {(displaySchool || displayGrade) && (
                      <p className="text-xs text-gray-500">
                        {displaySchool} {displayGrade}
                      </p>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {link.parent.email} | {new Date(link.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>

                <div className="shrink-0">
                  {link.status === "PENDING" ? (
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                      대기
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        link.status === "APPROVED"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {link.status === "APPROVED" ? "승인됨" : "거절됨"}
                    </span>
                  )}
                </div>
              </div>

              {/* PENDING: 학생 선택 + 연결/거절 버튼 */}
              {link.status === "PENDING" && (
                <div className="mt-3 border-t pt-3">
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">
                    연결할 학생 선택
                  </label>
                  <select
                    value={selectedStudents[link.id] || ""}
                    onChange={(e) =>
                      setSelectedStudents((prev) => ({ ...prev, [link.id]: e.target.value }))
                    }
                    className="mb-2 w-full rounded-lg border border-gray-300 p-2 text-sm"
                  >
                    <option value="">학생을 선택하세요</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || "이름 없음"} ({s.school} {s.grade})
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(link.id)}
                      disabled={!selectedStudents[link.id]}
                      className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      연결 승인
                    </button>
                    <button
                      onClick={() => handleReject(link.id)}
                      className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                    >
                      거절
                    </button>
                  </div>
                </div>
              )}

              {/* APPROVED: 연결된 학생 + 수정 기능 */}
              {link.status === "APPROVED" && (
                <div className="mt-3 border-t pt-3">
                  {editingLinks[link.id] !== undefined ? (
                    /* 수정 모드 */
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-gray-600">
                        학생 변경
                      </label>
                      <select
                        value={editingLinks[link.id] || ""}
                        onChange={(e) =>
                          setEditingLinks((prev) => ({ ...prev, [link.id]: e.target.value }))
                        }
                        className="mb-2 w-full rounded-lg border border-gray-300 p-2 text-sm"
                      >
                        <option value="">학생을 선택하세요</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name || "이름 없음"} ({s.school} {s.grade})
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(link.id)}
                          disabled={!editingLinks[link.id]}
                          className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => cancelEdit(link.id)}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-black hover:bg-gray-50"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 보기 모드 */
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-green-600">
                        연결된 학생: {link.student?.name || "이름 없음"} ({link.student?.school} {link.student?.grade})
                      </p>
                      <button
                        onClick={() => startEdit(link.id, link.student?.id || "")}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        수정
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-black">
            {filter === "ALL" ? "학부모 연결 요청이 없습니다." : "해당 상태의 요청이 없습니다."}
          </p>
        )}
      </div>
    </div>
  );
}
