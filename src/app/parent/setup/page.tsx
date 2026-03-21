"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Instructor {
  id: string;
  name: string | null;
  email: string;
}

interface Student {
  id: string;
  name: string | null;
  school: string | null;
  grade: string | null;
}

interface MyLink {
  id: string;
  status: string;
  student: { id: string; name: string | null; school: string | null; grade: string | null };
}

export default function ParentSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [myLinks, setMyLinks] = useState<MyLink[]>([]);
  const [selectedInstructor, setSelectedInstructor] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/parent/instructors").then((r) => r.json()),
      fetch("/api/parent/link").then((r) => r.json()),
    ]).then(([inst, links]) => {
      setInstructors(inst);
      setMyLinks(links);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedInstructor) return;
    fetch(`/api/parent/students?instructorId=${selectedInstructor}`)
      .then((r) => r.json())
      .then((data) => setStudents(data))
      .catch(() => setStudents([]));
  }, [selectedInstructor]);

  async function handleSubmit() {
    if (!selectedStudent) return;
    setSubmitting(true);
    setMessage("");

    const res = await fetch("/api/parent/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: selectedStudent }),
    });

    if (res.ok) {
      setMessage("연결 요청이 전송되었습니다. 강사의 승인을 기다려주세요.");
      // Refresh links
      const links = await fetch("/api/parent/link").then((r) => r.json());
      setMyLinks(links);
      setStep(1);
      setSelectedInstructor("");
      setSelectedStudent("");
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

      {/* 기존 연결 목록 */}
      {myLinks.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">연결된 자녀</h2>
          <div className="space-y-2">
            {myLinks.map((link) => (
              <div key={link.id} className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm">
                <div>
                  <p className="font-medium">{link.student.name || "이름 없음"}</p>
                  <p className="text-xs text-gray-500">
                    {link.student.school} {link.student.grade}
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
            ))}
          </div>
        </div>
      )}

      {/* 새 연결 요청 */}
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">새 자녀 연결</h2>

        {message && (
          <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            {message}
          </div>
        )}

        {/* Step 1: 강사 선택 */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-black">
            1단계: 강사 선택
          </label>
          <select
            value={selectedInstructor}
            onChange={(e) => {
              setSelectedInstructor(e.target.value);
              setSelectedStudent("");
              setStep(e.target.value ? 2 : 1);
            }}
            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
          >
            <option value="">강사를 선택하세요</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name || i.email}
              </option>
            ))}
          </select>
        </div>

        {/* Step 2: 학생 선택 */}
        {step >= 2 && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-black">
              2단계: 자녀 선택
            </label>
            {students.length === 0 ? (
              <p className="text-sm text-gray-500">해당 강사에 등록된 학생이 없습니다.</p>
            ) : (
              <select
                value={selectedStudent}
                onChange={(e) => {
                  setSelectedStudent(e.target.value);
                  if (e.target.value) setStep(3);
                }}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              >
                <option value="">자녀를 선택하세요</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || "이름 없음"} ({s.school} {s.grade})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Step 3: 전송 */}
        {step >= 3 && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-lg bg-purple-600 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? "요청 중..." : "연결 요청 보내기"}
          </button>
        )}
      </div>
    </div>
  );
}
