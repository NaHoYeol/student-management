"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { distributePoints } from "@/lib/distribute-points";
import { parseStoredExamData, sectionsToMarkdown } from "@/lib/exam-parser";
import type { ExamData, ExamSection } from "@/lib/exam-parser";

// ─── 헬퍼 ────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType = "text/markdown;charset=utf-8;") {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── JSON 구조 렌더러 ───────────────────────────────────────

function SectionRenderer({ sections }: { sections: ExamSection[] }) {
  if (sections.length === 0) {
    return <p className="text-sm text-black">구조화 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section, si) => (
        <div key={si} className="rounded-lg border border-gray-200 overflow-hidden">
          {section.range && (
            <div className="bg-blue-100 px-4 py-2">
              <span className="text-sm font-bold text-blue-800">[지문] {section.range}</span>
              {section.header && (
                <p className="mt-0.5 text-xs text-blue-600">{section.header}</p>
              )}
            </div>
          )}
          {section.passage && (
            <div className="border-b bg-blue-50 px-4 py-3 text-xs leading-relaxed text-gray-800 whitespace-pre-line">
              {section.passage}
            </div>
          )}
          {section.questions.map((q, qi) => (
            <div key={qi} className="border-b last:border-0 px-4 py-3">
              <div className="flex gap-2">
                <span className="shrink-0 rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                  {q.number}번
                </span>
                <p className="text-sm text-black">{q.text}</p>
              </div>
              {q.condition && (
                <div className="mt-2 ml-2 rounded border-l-3 border-orange-400 bg-orange-50 px-3 py-2">
                  <span className="text-xs font-bold text-orange-600">&lt;보기&gt;</span>
                  <p className="mt-1 text-xs leading-relaxed text-black whitespace-pre-line">{q.condition}</p>
                </div>
              )}
              {q.choices && q.choices.length > 0 && (
                <div className="mt-2 ml-2 space-y-0.5">
                  {q.choices.map((choice, ci) => (
                    <p key={ci} className="text-xs text-black">{choice}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── 타입 ────────────────────────────────────────────────────

interface AssignmentSummary {
  id: string;
  title: string;
  totalQuestions: number;
  createdAt: string;
  _count: { submissions: number };
}

interface Submission {
  id: string;
  score: number | null;
  totalPoints: number | null;
  submittedAt: string;
  resubmitApproved?: boolean;
  student: { id?: string; name: string | null; email: string };
  answers: { questionNumber: number; studentAnswer: number; isCorrect: boolean }[];
  isAgent?: boolean;
}

interface Assignment {
  id: string;
  title: string;
  totalQuestions: number;
  questions: { questionNumber: number; correctAnswer: number; points: number }[];
  examContent?: string;
}

interface StudentAnalysisData {
  score: number;
  totalPoints: number;
  correctRate: number;
  grade: number;
  rank: number;
  totalStudents: number;
  percentile: number;
  hasAgents: boolean;
  weakPattern: string;
  feedback: string;
  wrongQuestions: { questionNumber: number; correctRate: number; studentAnswer: number; correctAnswer: number }[];
  questionBreakdown: { questionNumber: number; isCorrect: boolean; correctAnswer: number; studentAnswer: number; correctRate: number }[];
}

// ─── 월별 과제 목록 컴포넌트 ─────────────────────────────────

function MonthlyAssignmentList() {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assignments")
      .then((res) => res.json())
      .then((data) => {
        setAssignments(data);
        setLoading(false);
      });
  }, []);

  // 월별 그룹핑
  const monthGroups = useMemo(() => {
    const groups = new Map<string, AssignmentSummary[]>();
    for (const a of assignments) {
      const date = new Date(a.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    // 최신순 정렬
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [assignments]);

  // 최근 2개월 계산 (동적)
  const recentMonths = useMemo(() => {
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previous = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    return new Set([current, previous]);
  }, []);

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // 초기 확장 상태 설정
  useEffect(() => {
    setExpandedMonths(new Set(recentMonths));
  }, [recentMonths]);

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function formatMonthLabel(key: string): string {
    const [year, month] = key.split("-");
    return `${year}년 ${parseInt(month)}월`;
  }

  if (loading) return <p className="text-black">로딩 중...</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">과제 관리</h1>
        <Link
          href="/admin/assignments/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 새 과제 만들기
        </Link>
      </div>

      {monthGroups.length === 0 && (
        <div className="rounded-lg bg-white px-4 py-12 text-center text-black shadow-sm">
          아직 등록된 과제가 없습니다.
        </div>
      )}

      {monthGroups.map(([monthKey, monthAssignments]) => {
        const isExpanded = expandedMonths.has(monthKey);
        const isRecent = recentMonths.has(monthKey);

        return (
          <div key={monthKey} className="mb-4">
            <button
              onClick={() => toggleMonth(monthKey)}
              className="flex w-full items-center gap-2 rounded-t-lg bg-gray-100 px-4 py-3 text-left hover:bg-gray-200"
            >
              <span
                className={`text-xs text-black transition-transform ${isExpanded ? "rotate-180" : ""}`}
              >
                ▼
              </span>
              <span className="font-semibold text-black">
                {formatMonthLabel(monthKey)}
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {monthAssignments.length}개
              </span>
              {isRecent && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  최근
                </span>
              )}
            </button>

            {isExpanded && (
              <div className="overflow-hidden rounded-b-lg bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 font-medium text-black">제목</th>
                      <th className="px-4 py-3 font-medium text-black">문항 수</th>
                      <th className="px-4 py-3 font-medium text-black">제출 수</th>
                      <th className="px-4 py-3 font-medium text-black">등록일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthAssignments.map((a) => (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/assignments?id=${a.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {a.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{a.totalQuestions}문항</td>
                        <td className="px-4 py-3">{a._count.submissions}명</td>
                        <td className="px-4 py-3 text-black">
                          {new Date(a.createdAt).toLocaleDateString("ko-KR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 과제 상세 컴포넌트 ──────────────────────────────────────

function AssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editAnswers, setEditAnswers] = useState<{ questionNumber: number; correctAnswer: number; points: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [agentCount, setAgentCount] = useState(0);

  // PDF 추출 관련
  const [extracting, setExtracting] = useState(false);
  const [extractStep, setExtractStep] = useState("");
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [showExamContent, setShowExamContent] = useState(false);
  const [viewMode, setViewMode] = useState<"raw" | "json" | "structured" | "markdown">("structured");

  // 학생 분석 관련
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentAnalysis, setStudentAnalysis] = useState<StudentAnalysisData | null>(null);
  const [studentAnalysisLoading, setStudentAnalysisLoading] = useState(false);

  // 재제출 승인 관련
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const markdownContent = useMemo(() => {
    if (!examData?.sections?.length) return "";
    return sectionsToMarkdown(examData.sections);
  }, [examData]);

  const questionCount = useMemo(() => {
    if (!examData?.sections) return 0;
    return examData.sections.reduce((sum, s) => sum + s.questions.length, 0);
  }, [examData]);

  function loadData() {
    Promise.all([
      fetch(`/api/assignments/${assignmentId}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/submissions?assignmentId=${assignmentId}`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/assignments/${assignmentId}/simulate`).then((r) => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 })),
    ]).then(([a, s, sim]) => {
      if (a) setAssignment(a);
      setSubmissions(s || []);
      setAgentCount(sim.count ?? 0);
      if (a?.examContent) {
        const parsed = parseStoredExamData(a.examContent);
        if (parsed) setExamData(parsed);
      }
      setLoading(false);
    });
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setExtracting(true);

    try {
      setExtractStep("1/3 PDF에서 텍스트 추출 중...");
      const { extractTextFromPdf } = await import("@/lib/pdf-text-extract");
      const arrayBuffer = await file.arrayBuffer();
      const rawText = await extractTextFromPdf(arrayBuffer);

      if (!rawText.trim()) {
        alert("PDF에서 텍스트를 추출할 수 없습니다. 스캔본 PDF일 수 있습니다.");
        setExtracting(false);
        return;
      }

      setExtractStep(`2/3 텍스트 추출 완료 (${rawText.length.toLocaleString()}자). 정규식 청킹 + GPT 분류 중...`);

      const res = await fetch(`/api/assignments/${assignmentId}/extract-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });

      if (res.ok) {
        const result = await res.json();
        setExamData(result.data);
        setShowExamContent(true);
        setViewMode("structured");
        const qCount = result.data.sections.reduce((sum: number, s: ExamSection) => sum + s.questions.length, 0);
        setExtractStep("");
        alert(`추출 완료! ${result.chunkCount}개 청크 처리, ${qCount}개 문항 분류됨.`);
      } else {
        const data = await res.json();
        alert(data.error || "GPT 분류에 실패했습니다.");
      }
    } catch (err) {
      alert("PDF 처리 중 오류: " + (err instanceof Error ? err.message : ""));
    }

    setExtracting(false);
    setExtractStep("");
  }

  async function handleSimulate() {
    if (!confirm("100명의 가상 응시자 데이터를 생성합니다. 기존 시뮬레이션 데이터는 삭제됩니다. 진행하시겠습니까?")) return;
    setSimulating(true);
    const res = await fetch(`/api/assignments/${assignmentId}/simulate`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setAgentCount(data.agentCount);
      alert(`${data.agentCount}명의 가상 응시자 데이터가 생성되었습니다.`);
    } else {
      alert("시뮬레이션에 실패했습니다.");
    }
    setSimulating(false);
  }

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [assignmentId]);

  function startEditing() {
    if (!assignment) return;
    setEditAnswers(assignment.questions.map((q) => ({ questionNumber: q.questionNumber, correctAnswer: q.correctAnswer, points: q.points })));
    setEditing(true);
  }

  function updateEditAnswer(index: number, answer: number) {
    setEditAnswers((prev) => prev.map((q, i) => (i === index ? { ...q, correctAnswer: answer } : q)));
  }

  function downloadEditSampleCSV() {
    const rows = ["문항번호,정답,배점", ...editAnswers.map((q) => `${q.questionNumber},${q.correctAnswer},${q.points}`)];
    downloadFile(rows.join("\n"), "정답표.csv", "text/csv;charset=utf-8;");
  }

  function handleEditCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      const parsed: { questionNumber: number; correctAnswer: number; points: number | null }[] = [];
      let hasExplicitPoints = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === 0 && /[가-힣a-zA-Z]/.test(line)) continue;
        const cols = line.split(",").map((c) => c.trim());
        if (cols.length < 2) continue;
        const qn = parseInt(cols[0]), ca = parseInt(cols[1]), ep = cols[2] ? parseInt(cols[2]) : null;
        if (ep !== null) hasExplicitPoints = true;
        if (isNaN(qn) || isNaN(ca) || ca < 1 || ca > 5) { alert("CSV 형식이 올바르지 않습니다."); return; }
        parsed.push({ questionNumber: qn, correctAnswer: ca, points: ep });
      }
      if (parsed.length > 0) {
        parsed.sort((a, b) => a.questionNumber - b.questionNumber);
        setEditAnswers(hasExplicitPoints
          ? parsed.map((q) => ({ ...q, points: q.points ?? 1 }))
          : parsed.map((q, i) => ({ ...q, points: distributePoints(parsed.length)[i] })));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleSaveEdit() {
    setSaving(true);
    const res = await fetch(`/api/assignments/${assignmentId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: editAnswers }),
    });
    if (res.ok) { setEditing(false); setLoading(true); loadData(); }
    else alert("정답 수정에 실패했습니다.");
    setSaving(false);
  }

  function downloadSubmissionsCSV() {
    if (!assignment || submissions.length === 0) return;
    const qNums = assignment.questions.map((q) => q.questionNumber);
    const header = ["이름", "이메일", "점수", "총점", "정답률", ...qNums.map((n) => `${n}번 답`), ...qNums.map((n) => `${n}번 정오`)];
    const rows = submissions.map((s) => {
      const am = new Map(s.answers.map((a) => [a.questionNumber, a]));
      const pct = s.totalPoints ? ((s.score! / s.totalPoints) * 100).toFixed(1) + "%" : "0%";
      return [s.student.name || "", s.student.email, s.score ?? "", s.totalPoints ?? "", pct,
        ...qNums.map((n) => am.get(n)?.studentAnswer ?? ""), ...qNums.map((n) => am.get(n)?.isCorrect ? "O" : "X")];
    });
    downloadFile([header, ...rows].map((r) => r.join(",")).join("\n"), `${assignment.title}_제출현황.csv`, "text/csv;charset=utf-8;");
  }

  // 학생 클릭 시 분석 결과 로드
  async function handleStudentClick(studentId: string) {
    if (selectedStudentId === studentId) {
      setSelectedStudentId(null);
      setStudentAnalysis(null);
      return;
    }
    setSelectedStudentId(studentId);
    setStudentAnalysisLoading(true);
    setStudentAnalysis(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/student-analysis?studentId=${studentId}`);
      if (res.ok) {
        setStudentAnalysis(await res.json());
      }
    } catch {
      // ignore
    }
    setStudentAnalysisLoading(false);
  }

  // 재제출 승인
  async function handleApproveResubmit(submissionId: string) {
    setApprovingId(submissionId);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve-resubmit`, {
        method: "PUT",
      });
      if (res.ok) {
        setSubmissions((prev) =>
          prev.map((s) => s.id === submissionId ? { ...s, resubmitApproved: true } : s)
        );
        alert("재제출이 승인되었습니다.");
      } else {
        alert("승인에 실패했습니다.");
      }
    } catch {
      alert("승인에 실패했습니다.");
    }
    setApprovingId(null);
  }

  const gradeColors: Record<number, string> = {
    1: "text-blue-700 bg-blue-50",
    2: "text-blue-600 bg-blue-50",
    3: "text-green-700 bg-green-50",
    4: "text-green-600 bg-green-50",
    5: "text-yellow-700 bg-yellow-50",
    6: "text-yellow-600 bg-yellow-50",
    7: "text-orange-700 bg-orange-50",
    8: "text-red-600 bg-red-50",
    9: "text-red-700 bg-red-50",
  };

  if (loading) return <p className="text-black">로딩 중...</p>;
  if (!assignment) {
    return (
      <div className="text-center py-12">
        <p className="text-black">과제를 찾을 수 없습니다.</p>
        <Link href="/admin/assignments" className="mt-4 text-blue-600 hover:underline">과제 관리로 이동</Link>
      </div>
    );
  }

  const avgScore = submissions.length > 0
    ? (submissions.reduce((sum, s) => sum + (s.score ?? 0), 0) / submissions.length).toFixed(1) : "-";

  return (
    <div>
      {/* 뒤로가기 */}
      <Link href="/admin/assignments" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        &larr; 과제 목록으로
      </Link>

      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{assignment.title}</h1>
          <p className="text-sm text-black">{assignment.totalQuestions}문항 | 제출 {submissions.length}명 | 평균 {avgScore}점</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={handleSimulate} disabled={simulating}
            className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
            {simulating ? "생성 중..." : agentCount > 0 ? `Agent 재생성 (${agentCount}명)` : "Agent 시뮬레이션"}
          </button>
          {submissions.length > 0 && (
            <Link href={`/admin/assignments/analysis?id=${assignmentId}`}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">성적 분석</Link>
          )}
        </div>
      </div>

      {/* 정답표 */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">정답표</h2>
        {!editing && <button onClick={startEditing} className="rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">정답 수정</button>}
      </div>
      {editing ? (
        <div className="mb-8 rounded-lg bg-white p-4 shadow-sm">
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {editAnswers.map((q, i) => (
              <div key={q.questionNumber} className="text-center">
                <label className="mb-1 block text-xs text-black">{q.questionNumber}</label>
                <select value={q.correctAnswer} onChange={(e) => updateEditAnswer(i, parseInt(e.target.value))}
                  className="w-full rounded border px-1 py-1 text-center text-sm text-black focus:border-blue-500 focus:outline-none">
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded border-2 border-dashed border-gray-200 p-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-black">CSV 파일로 정답 교체</label>
              <button type="button" onClick={downloadEditSampleCSV} className="text-xs font-medium text-blue-600 hover:underline">현재 정답표 CSV 다운로드</button>
            </div>
            <input type="file" accept=".csv" onChange={handleEditCSVUpload}
              className="block w-full text-xs text-black file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-600 hover:file:bg-blue-100" />
            <p className="mt-1 text-xs text-black">양식: 문항번호,정답,배점 (예: 1,3,2)</p>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSaveEdit} disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "저장 중..." : "저장 (재채점)"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2 text-xs font-medium text-black hover:bg-gray-50">취소</button>
          </div>
          {submissions.length > 0 && <p className="mt-2 text-xs text-amber-600">저장 시 기존 제출물 {submissions.length}건이 자동으로 재채점됩니다.</p>}
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-10 gap-2 rounded-lg bg-white p-4 shadow-sm">
          {assignment.questions.map((q) => (
            <div key={q.questionNumber} className="text-center">
              <span className="block text-xs text-black">{q.questionNumber}</span>
              <span className="text-sm font-bold text-blue-600">{q.correctAnswer}</span>
            </div>
          ))}
        </div>
      )}

      {/* PDF 시험지 업로드 */}
      <div className="mb-8 rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">시험지 PDF 업로드</h2>
          {examData && (
            <button onClick={() => setShowExamContent(!showExamContent)} className="text-xs font-medium text-blue-600 hover:underline">
              {showExamContent ? "숨기기" : "추출 내용 보기"}
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-black">
          1차: PDF → 코드로 텍스트 직접 추출 (2단 레이아웃 처리) → 2차: 정규식 청킹 → 3차: GPT-4o-mini JSON 태깅 (청크별 처리, 토큰 초과 없음)
        </p>
        <div className="flex items-center gap-3">
          <input type="file" accept=".pdf" onChange={handlePdfUpload} disabled={extracting}
            className="block text-xs text-black file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-600 hover:file:bg-indigo-100 disabled:opacity-50" />
          {extracting && <span className="text-xs text-indigo-600">{extractStep}</span>}
          {examData && !extracting && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              {questionCount}문항 추출 완료
            </span>
          )}
        </div>

        {showExamContent && examData && (
          <div className="mt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                {([
                  { key: "structured", label: "구조화 뷰" },
                  { key: "json", label: "JSON 데이터" },
                  { key: "markdown", label: "마크다운" },
                  { key: "raw", label: "PDF 원본" },
                ] as { key: typeof viewMode; label: string }[]).map((tab) => (
                  <button key={tab.key} onClick={() => setViewMode(tab.key)}
                    className={`rounded-t px-3 py-1 text-xs font-medium ${viewMode === tab.key ? "bg-indigo-600 text-white" : "bg-gray-200 text-black hover:bg-gray-300"}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button onClick={() => downloadFile(examData.raw, `${assignment.title}_PDF원본.txt`, "text/plain;charset=utf-8;")}
                  className="rounded border border-gray-400 px-2 py-1 text-xs font-medium text-black hover:bg-gray-50">TXT</button>
                <button onClick={() => downloadFile(JSON.stringify(examData.sections, null, 2), `${assignment.title}_구조화.json`, "application/json;charset=utf-8;")}
                  className="rounded border border-blue-400 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">JSON</button>
                {markdownContent && (
                  <button onClick={() => downloadFile(markdownContent, `${assignment.title}_시험지.md`)}
                    className="rounded border border-indigo-400 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">MD</button>
                )}
              </div>
            </div>

            {viewMode === "structured" && (
              <div className="max-h-[36rem] overflow-y-auto rounded border bg-gray-50 p-4">
                <SectionRenderer sections={examData.sections} />
              </div>
            )}
            {viewMode === "json" && (
              <div className="max-h-[36rem] overflow-y-auto rounded border bg-gray-900 p-4 font-mono text-xs leading-relaxed text-green-400 whitespace-pre-wrap">
                {JSON.stringify(examData.sections, null, 2)}
              </div>
            )}
            {viewMode === "markdown" && markdownContent && (
              <div className="max-h-[36rem] overflow-y-auto rounded border bg-white p-4 font-mono text-xs leading-relaxed text-gray-800 whitespace-pre-wrap">
                {markdownContent}
              </div>
            )}
            {viewMode === "raw" && (
              <div>
                <p className="mb-1 text-xs text-black">pdfjs-dist가 추출한 원본 텍스트 ({examData.raw.length.toLocaleString()}자)</p>
                <div className="max-h-[36rem] overflow-y-auto rounded border bg-gray-900 p-4 font-mono text-xs leading-relaxed text-green-400 whitespace-pre-wrap">
                  {examData.raw}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 제출 현황 */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">제출 현황</h2>
        {submissions.length > 0 && (
          <button onClick={downloadSubmissionsCSV} className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50">CSV 다운로드</button>
        )}
      </div>
      <div className="space-y-2">
        {submissions.map((s) => {
          const studentId = s.student.id || s.id;
          const isSelected = selectedStudentId === studentId;

          return (
            <div key={s.id} className="rounded-lg bg-white shadow-sm">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => s.student.id && handleStudentClick(s.student.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{s.student.name || s.student.email}</span>
                  <span className="text-xs text-black">{s.student.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">
                    {s.score}/{s.totalPoints} ({s.totalPoints ? ((s.score! / s.totalPoints) * 100).toFixed(0) : 0}%)
                  </span>
                  <span className="text-xs text-black">
                    {new Date(s.submittedAt).toLocaleDateString("ko-KR")}
                  </span>
                  {/* 재제출 승인 버튼 */}
                  {!s.resubmitApproved ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleApproveResubmit(s.id); }}
                      disabled={approvingId === s.id}
                      className="rounded border border-orange-500 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                    >
                      {approvingId === s.id ? "처리 중..." : "재제출 허용"}
                    </button>
                  ) : (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                      재제출 승인됨
                    </span>
                  )}
                  <span className={`text-black transition-transform ${isSelected ? "rotate-180" : ""}`}>
                    ▼
                  </span>
                </div>
              </div>

              {/* 학생 분석 결과 확장 패널 */}
              {isSelected && (
                <div className="border-t px-5 py-4">
                  {studentAnalysisLoading ? (
                    <p className="text-sm text-black">분석 결과 불러오는 중...</p>
                  ) : studentAnalysis ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                          <p className="text-xs text-black">점수</p>
                          <p className="text-lg font-bold text-blue-600">
                            {studentAnalysis.score}/{studentAnalysis.totalPoints}
                          </p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                          <p className="text-xs text-black">정답률</p>
                          <p className="text-lg font-bold text-green-600">{studentAnalysis.correctRate}%</p>
                        </div>
                        {studentAnalysis.hasAgents && (
                          <>
                            <div className="rounded-lg bg-gray-50 p-3 text-center">
                              <p className="text-xs text-black">추정 등급</p>
                              <p className={`text-lg font-bold rounded px-2 py-0.5 ${gradeColors[studentAnalysis.grade] || ""}`}>
                                {studentAnalysis.grade}등급
                              </p>
                            </div>
                            <div className="rounded-lg bg-gray-50 p-3 text-center">
                              <p className="text-xs text-black">백분위</p>
                              <p className="text-lg font-bold text-purple-600">
                                상위 {(100 - studentAnalysis.percentile).toFixed(1)}%
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {studentAnalysis.weakPattern && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                          <p className="text-xs font-semibold text-amber-800 mb-1">취약 패턴</p>
                          <p className="text-sm text-amber-700">{studentAnalysis.weakPattern}</p>
                        </div>
                      )}

                      <div className="rounded-lg bg-gray-50 p-4">
                        <p className="text-xs font-semibold text-black mb-2">AI 선생님 코멘트</p>
                        <p className="text-sm leading-relaxed text-black whitespace-pre-wrap">
                          {studentAnalysis.feedback}
                        </p>
                      </div>

                      {/* 문항별 결과 */}
                      {studentAnalysis.questionBreakdown && studentAnalysis.questionBreakdown.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-black mb-2">문항별 결과</p>
                          <div className="grid grid-cols-10 gap-1">
                            {studentAnalysis.questionBreakdown.map((q) => (
                              <div
                                key={q.questionNumber}
                                className={`rounded p-1 text-center text-xs ${
                                  q.isCorrect
                                    ? "bg-green-50 text-green-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                                title={`정답률 ${q.correctRate}% | 학생답 ${q.studentAnswer} / 정답 ${q.correctAnswer}`}
                              >
                                <span className="block font-medium">{q.questionNumber}</span>
                                <span className="block font-bold">{q.isCorrect ? "O" : "X"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {studentAnalysis.wrongQuestions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-black mb-2">
                            틀린 문항 ({studentAnalysis.wrongQuestions.length}개)
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {studentAnalysis.wrongQuestions.map((q) => (
                              <span
                                key={q.questionNumber}
                                className={`inline-block rounded px-2 py-1 text-xs ${
                                  q.correctRate >= 80 ? "bg-green-100 text-green-700"
                                  : q.correctRate >= 60 ? "bg-blue-100 text-blue-700"
                                  : q.correctRate >= 40 ? "bg-yellow-100 text-yellow-700"
                                  : q.correctRate >= 20 ? "bg-orange-100 text-orange-700"
                                  : "bg-red-100 text-red-700"
                                }`}
                                title={`정답률 ${q.correctRate}% | 내답 ${q.studentAnswer} / 정답 ${q.correctAnswer}`}
                              >
                                {q.questionNumber}번 ({q.correctRate}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-black">분석 결과를 불러올 수 없습니다.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {submissions.length === 0 && (
          <div className="rounded-lg bg-white px-4 py-8 text-center text-black shadow-sm">
            아직 제출한 학생이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────

function AssignmentsContent() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("id");

  if (assignmentId) {
    return <AssignmentDetail assignmentId={assignmentId} />;
  }

  return <MonthlyAssignmentList />;
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<p className="text-black">로딩 중...</p>}>
      <AssignmentsContent />
    </Suspense>
  );
}
