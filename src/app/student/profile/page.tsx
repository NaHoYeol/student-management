"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Profile {
  name: string | null;
  email: string;
  school: string | null;
  grade: string | null;
  classDay: string | null;
  classTime: string | null;
  instructorId: string | null;
}

interface Instructor {
  id: string;
  name: string | null;
  email: string;
}

type Options = Record<string, string[]>;

function SelectOrInput({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const isCustom = value !== "" && !options.includes(value);
  const [mode, setMode] = useState<"select" | "custom">(isCustom ? "custom" : "select");

  useEffect(() => {
    if (value !== "" && !options.includes(value)) {
      setMode("custom");
    }
  }, [value, options]);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-black">{label}</label>
      {mode === "select" ? (
        <>
          <select
            value={options.includes(value) ? value : ""}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setMode("custom");
                onChange("");
              } else {
                onChange(e.target.value);
              }
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
          >
            <option value="">선택</option>
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
            <option value="__custom__">직접 입력</option>
          </select>
        </>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
          />
          {options.length > 0 && (
            <button
              type="button"
              onClick={() => { setMode("select"); onChange(""); }}
              className="shrink-0 rounded-lg border px-3 py-2 text-xs text-black hover:bg-gray-50"
            >
              목록에서 선택
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { update: updateSession } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [options, setOptions] = useState<Options>({ school: [], grade: [], classDay: [], classTime: [] });
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [classDay, setClassDay] = useState("");
  const [classTime, setClassTime] = useState("");
  const [instructorId, setInstructorId] = useState("");

  useEffect(() => {
    fetch("/api/student/profile")
      .then((r) => r.json())
      .then((data: { profile: Profile; options: Options; instructors: Instructor[] }) => {
        setProfile(data.profile);
        setOptions(data.options);
        setInstructors(data.instructors || []);
        setName(data.profile.name ?? "");
        setSchool(data.profile.school ?? "");
        setGrade(data.profile.grade ?? "");
        setClassDay(data.profile.classDay ?? "");
        setClassTime(data.profile.classTime ?? "");
        setInstructorId(data.profile.instructorId ?? "");
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/student/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, school, grade, classDay, classTime, instructorId: instructorId || null }),
    });
    if (res.ok) {
      const data = await res.json();
      setProfile(data);
      setSaved(true);
      await updateSession();
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (loading) return <p className="text-black">로딩 중...</p>;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">내 정보</h1>

      <div className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-black">이메일</label>
          <p className="rounded-lg border bg-gray-50 px-3 py-2 text-sm text-black">
            {profile?.email}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-black">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름을 입력해 주세요"
            className="w-full rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* 담당 강사 선택 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-black">담당 강사</label>
          <select
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
          >
            <option value="">선택 안 함</option>
            {instructors.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name || inst.email}
              </option>
            ))}
          </select>
        </div>

        <SelectOrInput
          label="학교"
          value={school}
          onChange={setSchool}
          options={options.school}
          placeholder="예: OO고등학교"
        />

        <SelectOrInput
          label="학년"
          value={grade}
          onChange={setGrade}
          options={options.grade}
          placeholder="예: 고1"
        />

        <div className="grid grid-cols-2 gap-4">
          <SelectOrInput
            label="수업 요일"
            value={classDay}
            onChange={setClassDay}
            options={options.classDay}
            placeholder="예: 월"
          />
          <SelectOrInput
            label="수업 시간"
            value={classTime}
            onChange={setClassTime}
            options={options.classTime}
            placeholder="예: 16:00"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {saved && (
          <p className="text-center text-sm text-green-600">저장되었습니다.</p>
        )}
      </div>
    </div>
  );
}
