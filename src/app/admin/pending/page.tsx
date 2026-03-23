"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function PendingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    // 이미 승인된 강사는 대시보드로
    if (session.user.isApproved) {
      router.replace("/admin/dashboard");
      return;
    }
    // SUPERADMIN은 여기 올 일 없음
    if (session.user.role === "SUPERADMIN") {
      router.replace("/superadmin/instructors");
      return;
    }

    // 기존 프로필 불러오기
    fetch("/api/admin/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.name) setName(data.name);
        if (data.subject) setSubject(data.subject);
        if (data.academyName) setAcademyName(data.academyName);
        // 이미 프로필을 제출한 경우
        if (data.subject || data.academyName) setSubmitted(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), subject: subject.trim(), academyName: academyName.trim() }),
      });
      if (res.ok) setSubmitted(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-black">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-4 flex justify-center">
          <Image src="/aim-logo.png" alt="A.I.M" width={120} height={54} className="rounded-lg" priority />
        </div>

        {submitted ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
              <svg className="h-8 w-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-bold text-black">승인 대기 중</h1>
            <p className="text-sm text-gray-600">
              관리자가 가입 신청을 확인하고 있습니다.
              <br />
              승인이 완료되면 바로 이용하실 수 있습니다.
            </p>
            <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left text-sm">
              <p className="text-gray-700"><span className="font-medium text-black">이름:</span> {name}</p>
              {subject && <p className="mt-1 text-gray-700"><span className="font-medium text-black">과목:</span> {subject}</p>}
              {academyName && <p className="mt-1 text-gray-700"><span className="font-medium text-black">학원:</span> {academyName}</p>}
            </div>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-center text-xl font-bold text-black">강사 정보 입력</h1>
            <p className="mb-6 text-center text-sm text-gray-600">
              가입 승인을 위해 아래 정보를 입력해주세요.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-black">이름 *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-black"
                  placeholder="홍길동"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black">담당 과목</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-black"
                  placeholder="영어, 수학 등"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black">학원명</label>
                <input
                  type="text"
                  value={academyName}
                  onChange={(e) => setAcademyName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-black"
                  placeholder="OO학원"
                />
              </div>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "저장 중..." : "가입 신청"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
