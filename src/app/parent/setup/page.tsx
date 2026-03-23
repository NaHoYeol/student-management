"use client";

import { useEffect, useState } from "react";

interface MyLink {
  id: string;
  status: string;
  studentName: string | null;
  schoolName: string | null;
  gradeName: string | null;
  student: { id: string; name: string | null; school: string | null; grade: string | null } | null;
}

export default function ParentSetupPage() {
  const [myLinks, setMyLinks] = useState<MyLink[]>([]);
  const [studentName, setStudentName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [gradeName, setGradeName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/parent/link")
      .then((r) => r.json())
      .then((links) => {
        setMyLinks(links);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    if (!studentName.trim()) return;
    setSubmitting(true);
    setMessage("");

    const res = await fetch("/api/parent/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentName, schoolName, gradeName }),
    });

    if (res.ok) {
      setMessage("신청이 완료되었습니다. 강사의 확인 후 연결해드리겠습니다.");
      const links = await fetch("/api/parent/link").then((r) => r.json());
      setMyLinks(links);
      setStudentName("");
      setSchoolName("");
      setGradeName("");
    } else {
      const data = await res.json();
      setMessage(data.error || "요청 실패");
    }
    setSubmitting(false);
  }

  if (loading) return <p className="text-black">로딩 중...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">자녀 관리</h1>

      {/* 기존 신청 목록 */}
      {myLinks.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">신청 현황</h2>
          <div className="space-y-2">
            {myLinks.map((link) => {
              const name = link.student?.name || link.studentName || "이름 없음";
              const school = link.student?.school || link.schoolName || "";
              const grade = link.student?.grade || link.gradeName || "";
              return (
                <div key={link.id} className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm">
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-gray-500">
                      {school} {grade}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      link.status === "APPROVED"
                        ? "bg-green-100 text-green-700"
                        : link.status === "PENDING"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {link.status === "APPROVED" ? "승인됨" : link.status === "PENDING" ? "대기중" : "거절됨"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 새 자녀 연결 신청 */}
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">자녀 연결 신청</h2>
        <p className="mb-4 text-sm text-gray-500">
          자녀의 정보를 입력해주시면, 강사가 확인 후 연결해드립니다.
        </p>

        {message && (
          <div className={`mb-4 rounded-lg p-3 text-sm ${
            message.includes("완료") ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
          }`}>
            {message}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-black">
              자녀 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="예: 홍길동"
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-black">
              학교
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="예: OO고등학교"
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-black">
              학년
            </label>
            <input
              type="text"
              value={gradeName}
              onChange={(e) => setGradeName(e.target.value)}
              placeholder="예: 고2"
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !studentName.trim()}
            className="w-full rounded-lg bg-purple-600 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? "신청 중..." : "연결 신청하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
