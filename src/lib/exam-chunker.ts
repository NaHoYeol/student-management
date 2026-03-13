/**
 * 수능 국어 시험지 텍스트를 정규표현식으로 지문 세트(Chunk) 단위로 1차 분리.
 *
 * 핵심: PDF 텍스트 추출 시 대괄호 안에 공백이 삽입되는 경우가 많음.
 * 예: [ 1 ～ 3 ],  [ 43 ～ 45 ]
 * → \s* 를 대괄호 안쪽에도 넣어야 함.
 */

export interface TextChunk {
  type: "passage_group" | "standalone";
  range?: string;   // "1~3" — 항상 반각 ~ 로 정규화
  startNum?: number;
  endNum?: number;
  text: string;
}

// 모든 유니코드 물결/대시 + 대괄호 내부 공백 대응
// [ 1 ～ 3 ], [4~7], ［ 43 ～ 45 ］ 등 전부 매칭
const RE_PASSAGE_HEADER = /[\[［]\s*(\d+)\s*[~∼～〜–—\-]\s*(\d+)\s*[\]］]/g;

/**
 * 수능 시험지 원문 텍스트를 지문 세트 단위 청크로 분리.
 * 비용 0원, 0.01초.
 */
export function chunkExamText(rawText: string): TextChunk[] {
  const chunks: TextChunk[] = [];

  // 노이즈 제거
  const cleaned = rawText
    .replace(/^\s*\d+\s*$/gm, "")                       // 단독 페이지 번호
    .replace(/\d+\s*학년도/g, "")                         // "2020학년도"
    .replace(/대학수학능력시험/g, "")                       // 시험명
    .replace(/국어\s*영역\s*(\([가-힣]\s*형\))?/g, "")     // "국어 영역"
    .replace(/제\s*\d+\s*교시/g, "")                      // "제 1 교시"
    .replace(/성명\s*수험\s*번호/g, "")                    // 수험 정보
    .replace(/홀수\s*형|짝수\s*형/g, "")                   // 홀수형/짝수형
    .replace(/문제지/g, "")                                // 문제지
    .replace(/\*\s*확인\s*사항[\s\S]*$/g, "")              // 마지막 확인 사항
    .trim();

  // 모든 지문 헤더 위치 수집
  const headers: { index: number; matchLen: number; range: string; startNum: number; endNum: number }[] = [];
  let match;
  while ((match = RE_PASSAGE_HEADER.exec(cleaned)) !== null) {
    headers.push({
      index: match.index,
      matchLen: match[0].length,
      range: `${match[1]}~${match[2]}`,
      startNum: parseInt(match[1]),
      endNum: parseInt(match[2]),
    });
  }

  if (headers.length === 0) {
    return [{ type: "standalone", text: cleaned }];
  }

  // 지문 헤더 이전 텍스트 (독립 문항 또는 프리앰블)
  const preamble = cleaned.slice(0, headers[0].index).trim();
  if (preamble && /\d+\s*\./.test(preamble)) {
    chunks.push({ type: "standalone", text: preamble });
  }

  // 각 지문 세트를 청크로 분리 + 독립 문항 감지
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : cleaned.length;
    const fullText = cleaned.slice(start, end).trim();

    if (!fullText) continue;

    // 이 청크 안에서 지문 범위 밖의 문항이 있는지 확인
    // 예: [11~12] 청크에 13, 14, 15번 문항이 포함된 경우
    const rangeEnd = headers[i].endNum;
    const nextRangeStart = i + 1 < headers.length ? headers[i + 1].startNum : Infinity;

    // 범위 밖 첫 문항 번호 위치 찾기
    const outOfRangeRegex = new RegExp(`(?:^|\\n)\\s*(${rangeEnd + 1})\\s*\\.\\s`, "m");
    const outOfRangeMatch = outOfRangeRegex.exec(fullText);

    if (outOfRangeMatch && rangeEnd + 1 < nextRangeStart) {
      // 지문 범위 내 텍스트
      const passageText = fullText.slice(0, outOfRangeMatch.index).trim();
      // 독립 문항 텍스트
      const standaloneText = fullText.slice(outOfRangeMatch.index).trim();

      chunks.push({
        type: "passage_group",
        range: headers[i].range,
        startNum: headers[i].startNum,
        endNum: headers[i].endNum,
        text: passageText,
      });

      if (standaloneText) {
        chunks.push({
          type: "standalone",
          text: standaloneText,
        });
      }
    } else {
      chunks.push({
        type: "passage_group",
        range: headers[i].range,
        startNum: headers[i].startNum,
        endNum: headers[i].endNum,
        text: fullText,
      });
    }
  }

  return chunks;
}

/**
 * 큰 청크 분할 (6000자 초과 시)
 */
export function splitLargeChunk(chunk: TextChunk, maxChars = 6000): TextChunk[] {
  if (chunk.text.length <= maxChars) return [chunk];

  const questionStarts: number[] = [];
  const re = /(?:^|\n)\s*(\d{1,2})\.\s/g;
  let m;
  while ((m = re.exec(chunk.text)) !== null) {
    questionStarts.push(m.index);
  }

  if (questionStarts.length <= 1) return [chunk];

  const midIdx = Math.floor(questionStarts.length / 2);
  const splitPos = questionStarts[midIdx];

  return [
    { ...chunk, text: chunk.text.slice(0, splitPos).trim() },
    { ...chunk, range: chunk.range ? `${chunk.range}_cont` : undefined, text: chunk.text.slice(splitPos).trim() },
  ];
}

/**
 * 청킹 + 대형 청크 분할
 */
export function prepareChunks(rawText: string): TextChunk[] {
  const chunks = chunkExamText(rawText);
  const result: TextChunk[] = [];
  for (const chunk of chunks) {
    result.push(...splitLargeChunk(chunk));
  }
  return result;
}
