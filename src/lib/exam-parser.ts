/**
 * 수능 국어 시험지 구조화 데이터 타입 및 변환 유틸리티
 */

// ─── JSON 구조 타입 (GPT 출력 + DB 저장 형식) ─────────────

export interface ExamQuestion {
  number: number;
  text: string;
  condition: string | null;  // <보기>
  choices: string[];          // ["① ...", "② ...", ...]
}

export interface ExamSection {
  range: string | null;       // "1~3" (독립 문항이면 null)
  header: string | null;      // "[1~3] 다음 글을 읽고 물음에 답하시오."
  passage: string | null;     // 지문 본문 (없으면 null)
  questions: ExamQuestion[];
}

export interface ExamData {
  raw: string;                // PDF에서 코드로 추출한 원본 텍스트
  sections: ExamSection[];    // GPT가 JSON으로 태깅한 구조화 데이터
}

// ─── DB 저장/복원 ────────────────────────────────────────────

/** DB에 저장된 examContent 문자열을 파싱 */
export function parseStoredExamData(stored: string | null | undefined): ExamData | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed.raw !== undefined && Array.isArray(parsed.sections)) {
      return parsed as ExamData;
    }
    // 이전 형식 호환: { raw, classified }
    if (parsed.raw && parsed.classified) {
      return { raw: parsed.raw, sections: [] };
    }
  } catch {
    // 레거시: 순수 텍스트
  }
  return { raw: stored, sections: [] };
}

// ─── JSON → 마크다운 변환 ────────────────────────────────────

/** ExamSection 배열을 마크다운 문자열로 변환 */
export function sectionsToMarkdown(sections: ExamSection[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    // 지문 그룹 헤더
    if (section.range) {
      parts.push(`## [지문] ${section.range}`);
      if (section.header) {
        parts.push(`> ${section.header}`);
      }
      parts.push("");
    }

    // 지문 본문
    if (section.passage) {
      parts.push(section.passage);
      parts.push("");
    }

    // 문항
    for (const q of section.questions) {
      parts.push(`### ${q.number}. ${q.text}`);

      if (q.condition) {
        parts.push("");
        parts.push(`**<보기>**`);
        parts.push(q.condition);
      }

      if (q.choices && q.choices.length > 0) {
        parts.push("");
        for (const choice of q.choices) {
          parts.push(choice);
        }
      }

      parts.push("");
      parts.push("---");
      parts.push("");
    }
  }

  return parts.join("\n").trim();
}

// ─── 하위 호환: 이전 processExamContent 유지 ─────────────────

/** (레거시) 텍스트 기반 파싱 — 새 코드에서는 사용하지 않음 */
export function processExamContent(rawText: string): string {
  // 새 JSON 형식이면 마크다운으로 변환
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return sectionsToMarkdown(parsed.sections);
    }
  } catch {
    // 순수 텍스트
  }
  return rawText;
}
