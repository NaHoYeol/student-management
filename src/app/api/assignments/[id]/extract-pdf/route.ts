import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { prepareChunks, type TextChunk } from "@/lib/exam-chunker";
import type { ExamSection, ExamData } from "@/lib/exam-parser";

// ── GPT 시스템 프롬프트: COT 기반 단계별 분류 ──

const SYSTEM_PROMPT_PASSAGE = `당신은 수능 국어 시험지 텍스트를 JSON으로 구조화하는 전문가입니다.

## 작업 순서 (Chain of Thought)
아래 단계를 순서대로 따르세요. 각 단계를 완료한 후 다음 단계로 넘어가세요.

### 1단계: 지문(passage) 식별
- 텍스트에서 첫 번째 "N." (숫자+마침표) 패턴이 나오기 전까지의 모든 텍스트가 지문입니다.
- "[범위] 다음 글을 읽고 물음에 답하시오." 같은 헤더도 포함합니다.
- (가), (나), (다) 등 하위 지문이 있으면 전부 passage에 포함합니다.
- 지문 텍스트를 한 글자도 수정하지 말고 그대로 passage 필드에 넣으세요.

### 2단계: 문항(question) 식별
- "N." 패턴(예: "1.", "2.", "43.")으로 시작하는 각 문항을 찾으세요.
- 문항 번호 뒤의 질문 텍스트를 text 필드에 넣으세요.

### 3단계: 각 문항의 <보기> 식별
- 문항 내에 "<보기>" 또는 "< 보 기 >" 텍스트가 있으면, 그 뒤의 내용을 condition에 넣으세요.
- <보기>가 없는 문항은 condition: null 로 설정하세요.

### 4단계: 선지(choices) 식별
- ①, ②, ③, ④, ⑤ 기호로 시작하는 각 선지를 choices 배열에 넣으세요.
- 원문자 기호를 포함하여 원문 그대로 넣으세요.

## 절대 규칙
- 원문 텍스트를 **절대 수정하지 마세요**. 글자 하나, 조사 하나도 바꾸지 않습니다.
- 내용을 요약하거나 생략하지 마세요. 원문 전체를 그대로 담으세요.
- JSON 객체 하나만 반환하세요.

## JSON 형식
{
  "range": "user 메시지에서 지정한 range 값을 그대로 사용",
  "header": "헤더 텍스트 원문 그대로",
  "passage": "지문 본문 전체 (줄바꿈 포함, 생략 금지)",
  "questions": [
    {
      "number": 문항번호(정수),
      "text": "문항 텍스트 원문 그대로",
      "condition": "보기 텍스트 원문 (없으면 null)",
      "choices": ["① ...", "② ...", "③ ...", "④ ...", "⑤ ..."]
    }
  ]
}`;

const SYSTEM_PROMPT_STANDALONE = `당신은 수능 국어 시험지 텍스트를 JSON으로 구조화하는 전문가입니다.

## 작업 대상
이 텍스트는 **독립 문항**입니다. 공통 지문 없이 각 문항이 독립적입니다.

## 작업 순서 (Chain of Thought)

### 1단계: 문항(question) 식별
- "N." 패턴(예: "13.", "14.")으로 시작하는 각 문항을 찾으세요.
- 문항 번호 뒤의 질문 텍스트를 text 필드에 넣으세요.
- 문항 내에 자체 짧은 지문이 있으면 text에 포함하세요.

### 2단계: 각 문항의 <보기> 식별
- 문항 내에 "<보기>" 텍스트가 있으면 condition에 넣으세요.
- 없으면 condition: null

### 3단계: 선지(choices) 식별
- ①~⑤ 기호의 각 선지를 choices 배열에 원문 그대로 넣으세요.

## 절대 규칙
- 원문을 **절대 수정하지 마세요**.
- JSON 객체 하나만 반환하세요.

## JSON 형식
{
  "range": null,
  "header": null,
  "passage": null,
  "questions": [
    {
      "number": 문항번호(정수),
      "text": "문항 텍스트 원문 그대로",
      "condition": "보기 텍스트 원문 (없으면 null)",
      "choices": ["① ...", "② ...", "③ ...", "④ ...", "⑤ ..."]
    }
  ]
}`;

/** 동시 실행 제한 유틸 */
async function asyncPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const [i, item] of items.entries()) {
    const p = fn(item).then((r) => { results[i] = r; });
    const tracked: Promise<void> = p.then(() => { executing.delete(tracked); });
    executing.add(tracked);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

/** 청크 하나를 GPT로 처리 (COT 프롬프트 적용) */
async function classifyChunk(
  openai: OpenAI,
  chunk: TextChunk
): Promise<ExamSection> {
  const isPassageGroup = chunk.type === "passage_group" && !!chunk.range;

  // 청크 유형에 따라 다른 시스템 프롬프트 사용
  const systemPrompt = isPassageGroup ? SYSTEM_PROMPT_PASSAGE : SYSTEM_PROMPT_STANDALONE;

  // 유저 메시지: range를 명시적으로 전달
  const rangeInstruction = isPassageGroup
    ? `range: "${chunk.range}" (이 값을 range 필드에 반드시 그대로 사용하세요)\n문항 범위: ${chunk.startNum}번 ~ ${chunk.endNum}번`
    : `이 텍스트는 독립 문항입니다. range: null`;

  const userMessage = `${rangeInstruction}\n\n---\n${chunk.text}`;

  // 출력 토큰: 입력 텍스트 길이에 비례 (원문을 그대로 담아야 하므로)
  const maxTokens = Math.min(16384, Math.max(2048, Math.ceil(chunk.text.length * 1.5)));

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    max_tokens: maxTokens,
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(content);

    // GPT가 다양한 형태로 반환할 수 있으므로 유연하게 처리
    if (Array.isArray(parsed)) {
      return parsed[0] as ExamSection;
    }
    if (Array.isArray(parsed.sections)) {
      return parsed.sections[0] as ExamSection;
    }
    if (parsed.questions) {
      return parsed as ExamSection;
    }
  } catch {
    // JSON 파싱 실패
  }

  // fallback: 파싱 실패 시 원본 텍스트 보존
  return {
    range: chunk.range || null,
    header: null,
    passage: chunk.text,
    questions: [],
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const rawText = body.rawText as string;

  if (!rawText || rawText.trim().length === 0) {
    return NextResponse.json({ error: "추출된 텍스트가 비어있습니다." }, { status: 400 });
  }

  // API 키 확인
  let apiKey: string | null = null;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
    apiKey = setting?.value || null;
  } catch {
    // ignore
  }

  if (!apiKey || apiKey === "x") {
    return NextResponse.json(
      { error: "OpenAI API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 등록해 주세요." },
      { status: 400 }
    );
  }

  try {
    const openai = new OpenAI({ apiKey });

    // ── 1차: 정규식으로 청킹 (비용 0원, 즉시) ──
    const chunks = prepareChunks(rawText);

    // ── 2차: 각 청크를 GPT에 병렬(3개씩)로 보내 JSON 태깅 ──
    const sections = await asyncPool(chunks, 3, (chunk) =>
      classifyChunk(openai, chunk)
    );

    // DB 저장
    const examData: ExamData = { raw: rawText, sections };
    await prisma.assignment.update({
      where: { id },
      data: { examContent: JSON.stringify(examData) },
    });

    return NextResponse.json({
      success: true,
      data: examData,
      chunkCount: chunks.length,
      sectionCount: sections.length,
      questionCount: sections.reduce((sum, s) => sum + s.questions.length, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GPT API 호출에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
