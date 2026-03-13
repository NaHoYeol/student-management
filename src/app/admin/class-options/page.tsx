"use client";

import { useEffect, useState } from "react";

type Options = Record<string, string[]>;

const FIELD_LABELS: Record<string, string> = {
  school: "학교명",
  grade: "학년",
  classDay: "수업 요일",
  classTime: "수업 시간",
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  school: "예: OO고등학교",
  grade: "예: 고1",
  classDay: "예: 월",
  classTime: "예: 16:00",
};

const FIELD_ORDER = ["school", "grade", "classDay", "classTime"];

export default function ClassOptionsPage() {
  const [options, setOptions] = useState<Options>({ school: [], grade: [], classDay: [], classTime: [] });
  const [loading, setLoading] = useState(true);
  const [newValues, setNewValues] = useState<Record<string, string>>({
    school: "", grade: "", classDay: "", classTime: "",
  });

  function loadOptions() {
    fetch("/api/admin/class-options")
      .then((r) => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then((data) => {
        setOptions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadOptions(); }, []);

  async function handleAdd(type: string) {
    const value = newValues[type]?.trim();
    if (!value) return;

    const res = await fetch("/api/admin/class-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
    });

    if (res.ok) {
      setNewValues((prev) => ({ ...prev, [type]: "" }));
      loadOptions();
    }
  }

  async function handleDelete(type: string, value: string) {
    const res = await fetch("/api/admin/class-options", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
    });
    if (res.ok) loadOptions();
  }

  if (loading) return <p className="text-black">로딩 중...</p>;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">반 편성 선택지 관리</h1>
      <p className="mb-6 text-sm text-black">
        학생들이 프로필에서 선택할 수 있는 항목을 관리합니다. 여기에 없는 값은 학생이 직접 입력합니다.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {FIELD_ORDER.map((type) => (
          <div key={type} className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-black">
              {FIELD_LABELS[type]}
            </h2>

            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newValues[type]}
                onChange={(e) =>
                  setNewValues((prev) => ({ ...prev, [type]: e.target.value }))
                }
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(type); }}
                placeholder={FIELD_PLACEHOLDERS[type]}
                className="flex-1 rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => handleAdd(type)}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                추가
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {options[type].length === 0 && (
                <p className="text-xs text-black">아직 등록된 항목이 없습니다.</p>
              )}
              {options[type].map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-black"
                >
                  {v}
                  <button
                    onClick={() => handleDelete(type, v)}
                    className="ml-0.5 text-black hover:text-red-500"
                    title="삭제"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
