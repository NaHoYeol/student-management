"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnalysisReport } from "@/components/analysis-report";
import type { AnalysisResult } from "@/lib/statistics";

function AnalysisContent() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("id");

  const [title, setTitle] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!assignmentId) {
      setLoading(false);
      return;
    }
    fetch(`/api/assignments/${assignmentId}/analysis`)
      .then((r) => {
        if (!r.ok) throw r;
        return r.json();
      })
      .then((data) => {
        setTitle(data.title);
        setAnalysis(data.analysis);
        setLoading(false);
      })
      .catch(async (r) => {
        if (r.json) {
          const data = await r.json();
          setError(
            data.error === "Not published"
              ? "아직 분석 결과가 공개되지 않았습니다."
              : data.error
          );
        } else {
          setError("분석 결과를 불러올 수 없습니다.");
        }
        setLoading(false);
      });
  }, [assignmentId]);

  function handlePrint() {
    window.print();
  }

  if (loading) return <p className="text-gray-900">로딩 중...</p>;

  if (!assignmentId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-900">과제를 선택해 주세요.</p>
        <Link href="/student/assignments" className="mt-4 text-blue-600 hover:underline">
          과제 목록으로
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="mb-4 text-gray-900">{error}</p>
        <Link href="/student/assignments" className="text-blue-600 hover:underline">
          과제 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href="/student/assignments"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; 과제 목록으로
        </Link>
        <button
          onClick={handlePrint}
          className="rounded-lg border border-gray-400 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          PDF 다운로드
        </button>
      </div>
      <AnalysisReport title={title} analysis={analysis} hideCount />
    </div>
  );
}

export default function StudentAnalysisPage() {
  return (
    <Suspense fallback={<p className="text-gray-900">로딩 중...</p>}>
      <AnalysisContent />
    </Suspense>
  );
}
