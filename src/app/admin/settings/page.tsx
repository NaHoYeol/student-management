"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState("");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setHasKey(data.hasKey);
        setMasked(data.masked);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!newKey.trim()) return;
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: newKey.trim() }),
    });
    if (res.ok) {
      setHasKey(true);
      setMasked(newKey.slice(0, 7) + "..." + newKey.slice(-4));
      setNewKey("");
      setMessage("API 키가 저장되었습니다.");
    } else {
      const data = await res.json().catch(() => null);
      setMessage(`저장 실패 (${res.status}): ${data?.error || res.statusText}`);
    }
    setSaving(false);
  }

  if (loading) return <p className="text-gray-900">로딩 중...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">설정</h1>

      <div className="max-w-lg rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">OpenAI API 키</h2>
        <p className="mb-3 text-sm text-gray-900">
          개별 성적 분석 시 GPT-4o-mini를 사용한 피드백 생성에 필요합니다.
          키는 서버에만 저장되며 외부에 노출되지 않습니다.
        </p>

        {hasKey && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-gray-900">현재 키:</span>
            <code className="rounded bg-gray-100 px-2 py-1 text-sm">{masked}</code>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={hasKey ? "새 키로 변경..." : "sk-..."}
            className="flex-1 rounded-lg border px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSave}
            disabled={saving || !newKey.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>

        {message && (
          <p className={`mt-2 text-sm ${message.includes("실패") ? "text-red-500" : "text-green-600"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
