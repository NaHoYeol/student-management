"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface StudentData {
  id: string;
  name: string | null;
  email: string;
  school: string | null;
  grade: string | null;
  classDay: string | null;
  classTime: string | null;
  submissionCount: number;
  avgScore: number | null;
}

const DAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"];

function groupLabel(s: StudentData): string {
  const parts = [s.school, s.grade, s.classDay ? `${s.classDay}요일` : null, s.classTime].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "미배정";
}

function groupSortKey(key: string): string {
  if (key === "미배정") return "zzz";
  const dayMatch = key.match(/(월|화|수|목|금|토|일)요일/);
  const dayIdx = dayMatch ? DAY_ORDER.indexOf(dayMatch[1]) : 9;
  return `${key.split(" / ")[0] ?? ""}_${dayIdx}_${key}`;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/students")
      .then((res) => res.json())
      .then((data) => {
        setStudents(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleDelete(student: StudentData) {
    const label = student.name || student.email;
    if (!confirm(`"${label}" 학생을 삭제하시겠습니까?\n제출 기록, 분석 결과 등 모든 데이터가 함께 삭제됩니다.`)) return;
    setDeletingId(student.id);
    try {
      const res = await fetch(`/api/admin/students/${student.id}`, { method: "DELETE" });
      if (res.ok) {
        setStudents((prev) => prev.filter((s) => s.id !== student.id));
      } else {
        alert("삭제에 실패했습니다.");
      }
    } catch {
      alert("삭제에 실패했습니다.");
    }
    setDeletingId(null);
  }

  if (loading) return <p className="text-black">로딩 중...</p>;

  // Group by school + grade + day + time
  const groups = new Map<string, StudentData[]>();
  for (const s of students) {
    const key = groupLabel(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const sortedKeys = Array.from(groups.keys()).sort((a, b) =>
    groupSortKey(a).localeCompare(groupSortKey(b))
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">학생 관리</h1>
        <p className="text-sm text-black">전체 {students.length}명</p>
      </div>

      {sortedKeys.map((key) => {
        const group = groups.get(key)!;
        return (
          <div key={key} className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-lg font-semibold">{key}</h2>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {group.length}명
              </span>
            </div>
            <div className="overflow-hidden rounded-lg bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-black">이름</th>
                    <th className="px-4 py-3 font-medium text-black">이메일</th>
                    <th className="px-4 py-3 font-medium text-black">제출 수</th>
                    <th className="px-4 py-3 font-medium text-black">평균 점수</th>
                    <th className="px-4 py-3 font-medium text-black w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/admin/students/${s.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {s.name || "-"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-black">{s.email}</td>
                      <td className="px-4 py-3">{s.submissionCount}개</td>
                      <td className="px-4 py-3">
                        {s.avgScore !== null ? `${s.avgScore}점` : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.preventDefault(); handleDelete(s); }}
                          disabled={deletingId === s.id}
                          className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === s.id ? "삭제 중..." : "삭제"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {students.length === 0 && (
        <div className="rounded-lg bg-white px-4 py-12 text-center text-black shadow-sm">
          등록된 학생이 없습니다.
        </div>
      )}
    </div>
  );
}
