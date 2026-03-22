"use client";

import { useState } from "react";

interface ExamViewerProps {
  markdown: string;
  defaultOpen?: boolean;
}

export function ExamViewer({ markdown, defaultOpen = false }: ExamViewerProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!markdown) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition"
      >
        <span className="font-semibold text-black">시험지 보기</span>
        <svg
          className={`h-5 w-5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t px-5 py-4">
          <div className="exam-markdown max-h-[70vh] overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm leading-relaxed text-black whitespace-pre-wrap">
            {markdown.split("\n").map((line, i) => {
              if (line.startsWith("## ")) {
                return (
                  <h2 key={i} className="mb-2 mt-6 text-base font-bold text-blue-800 first:mt-0">
                    {line.replace(/^## /, "")}
                  </h2>
                );
              }
              if (line.startsWith("### ")) {
                return (
                  <h3 key={i} className="mb-1 mt-4 text-sm font-bold text-gray-900">
                    {line.replace(/^### /, "")}
                  </h3>
                );
              }
              if (line.startsWith("> ")) {
                return (
                  <blockquote key={i} className="mb-2 border-l-4 border-blue-300 pl-3 text-sm italic text-gray-700">
                    {line.replace(/^> /, "")}
                  </blockquote>
                );
              }
              if (line === "---") {
                return <hr key={i} className="my-3 border-gray-300" />;
              }
              if (line.startsWith("**<보기>**")) {
                return (
                  <p key={i} className="mt-2 font-semibold text-orange-700">
                    {line.replace(/\*\*/g, "")}
                  </p>
                );
              }
              if (/^[①②③④⑤]/.test(line)) {
                return (
                  <p key={i} className="ml-2 text-sm text-gray-800">
                    {line}
                  </p>
                );
              }
              if (line.trim() === "") {
                return <div key={i} className="h-1" />;
              }
              return (
                <p key={i} className="text-sm text-gray-800">
                  {line}
                </p>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
