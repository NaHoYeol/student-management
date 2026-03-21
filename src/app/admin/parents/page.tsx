"use client";

import { useEffect, useState } from "react";

interface ParentLink {
  id: string;
  status: string;
  createdAt: string;
  parent: { id: string; name: string | null; email: string };
  student: { id: string; name: string | null; school: string | null; grade: string | null };
}

export default function AdminParentsPage() {
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");

  useEffect(() => {
    fetch("/api/admin/parent-links")
      .then((r) => r.json())
      .then((data) => {
        setLinks(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleAction(id: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch(`/api/admin/parent-links/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
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
        {filtered.map((link) => (
          <div key={link.id} className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {link.parent.name || link.parent.email}{" "}
                  <span className="text-sm text-gray-500">→</span>{" "}
                  {link.student.name || "이름 없음"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {link.student.school} {link.student.grade} | {link.parent.email}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(link.createdAt).toLocaleDateString("ko-KR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {link.status === "PENDING" ? (
                  <>
                    <button
                      onClick={() => handleAction(link.id, "APPROVED")}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => handleAction(link.id, "REJECTED")}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
                    >
                      거절
                    </button>
                  </>
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
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-black">
            {filter === "ALL" ? "학부모 연결 요청이 없습니다." : "해당 상태의 요청이 없습니다."}
          </p>
        )}
      </div>
    </div>
  );
}
