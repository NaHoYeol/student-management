"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Instructor {
  id: string;
  name: string | null;
  email: string;
  subject: string | null;
  academyName: string | null;
  isApproved: boolean;
  approvedAt: string | null;
  createdAt: string;
}

export default function InstructorsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved">("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user && session.user.role !== "SUPERADMIN") {
      router.replace("/");
    }
  }, [session, router]);

  const fetchInstructors = useCallback(() => {
    fetch("/api/superadmin/instructors")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setInstructors(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchInstructors(); }, [fetchInstructors]);

  async function handleAction(instructorId: string, action: "approve" | "reject") {
    const msg = action === "approve" ? "승인하시겠습니까?" : "거절하시겠습니까? (계정이 삭제됩니다)";
    if (!confirm(msg)) return;

    setActionLoading(instructorId);
    try {
      const res = await fetch("/api/superadmin/instructors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructorId, action }),
      });
      if (res.ok) fetchInstructors();
      else alert("처리에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(instructorId: string) {
    if (!confirm("이 강사 계정을 삭제하시겠습니까? 관련된 모든 데이터가 삭제됩니다.")) return;

    setActionLoading(instructorId);
    try {
      const res = await fetch(`/api/superadmin/instructors?id=${instructorId}`, { method: "DELETE" });
      if (res.ok) fetchInstructors();
      else alert("삭제에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  }

  const pending = instructors.filter((i) => !i.isApproved);
  const approved = instructors.filter((i) => i.isApproved);
  const displayed = tab === "pending" ? pending : approved;

  if (loading) {
    return <div className="py-12 text-center text-black">로딩 중...</div>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-black">강사 관리</h1>

      {/* 탭 */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("pending")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "pending"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-black hover:bg-gray-200"
          }`}
        >
          승인 대기 ({pending.length})
        </button>
        <button
          onClick={() => setTab("approved")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "approved"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-black hover:bg-gray-200"
          }`}
        >
          승인됨 ({approved.length})
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          {tab === "pending" ? "대기 중인 강사가 없습니다." : "승인된 강사가 없습니다."}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((inst) => (
            <div key={inst.id} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-black">{inst.name || "(이름 미입력)"}</p>
                    {!inst.isApproved && (
                      <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">대기</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{inst.email}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                    {inst.subject && <span>과목: {inst.subject}</span>}
                    {inst.academyName && <span>학원: {inst.academyName}</span>}
                    <span>가입: {new Date(inst.createdAt).toLocaleDateString("ko-KR")}</span>
                    {inst.approvedAt && (
                      <span>승인: {new Date(inst.approvedAt).toLocaleDateString("ko-KR")}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  {tab === "pending" ? (
                    <>
                      <button
                        onClick={() => handleAction(inst.id, "approve")}
                        disabled={actionLoading === inst.id}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => handleAction(inst.id, "reject")}
                        disabled={actionLoading === inst.id}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        거절
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleDelete(inst.id)}
                      disabled={actionLoading === inst.id}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
