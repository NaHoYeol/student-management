/**
 * pdfjs-dist를 사용하여 PDF에서 텍스트를 직접 추출한다.
 * 수능 시험지의 2단(Two-column) 레이아웃을 좌→우 순서로 정렬 처리.
 *
 * 이 방식은 GPT 비전(OCR)과 달리:
 * - PDF에 내장된 실제 텍스트를 그대로 가져옴 (할루시네이션 없음)
 * - 2단 레이아웃의 읽기 순서를 좌표 기반으로 정확히 처리
 */

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * PDF 파일의 ArrayBuffer에서 전체 텍스트를 추출한다.
 * 2단 레이아웃을 자동 감지하여 왼쪽 열 → 오른쪽 열 순서로 텍스트를 정렬한다.
 */
export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allPagesText: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;

    // 텍스트 아이템 수집 (위치 정보 포함)
    const items: TextItem[] = [];
    for (const item of textContent.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const t = item.transform; // [scaleX, skewX, skewY, scaleY, x, y]
      items.push({
        str: item.str,
        x: t[4],
        y: t[5],
        width: item.width,
        height: Math.abs(t[3]),
      });
    }

    if (items.length === 0) continue;

    // ── 2단 레이아웃 감지 ──
    // 페이지 중앙 기준으로 좌/우 열 구분
    const midX = pageWidth / 2;

    // x좌표 분포를 보고 2단인지 판단
    const leftItems = items.filter((i) => i.x + i.width / 2 < midX);
    const rightItems = items.filter((i) => i.x + i.width / 2 >= midX);
    const isTwoColumn = leftItems.length > 5 && rightItems.length > 5;

    let sortedItems: TextItem[];

    if (isTwoColumn) {
      // 2단: 왼쪽 열(위→아래) 먼저, 오른쪽 열(위→아래) 다음
      const sortByY = (a: TextItem, b: TextItem) => b.y - a.y; // PDF 좌표: y가 클수록 위
      leftItems.sort(sortByY);
      rightItems.sort(sortByY);
      sortedItems = [...leftItems, ...rightItems];
    } else {
      // 1단: 위→아래 순서
      sortedItems = [...items].sort((a, b) => b.y - a.y);
    }

    // ── 텍스트 아이템을 줄(line)로 그룹화 ──
    const lines: { y: number; items: TextItem[] }[] = [];
    const Y_THRESHOLD = 3; // 같은 줄로 간주할 y좌표 차이

    for (const item of sortedItems) {
      const existingLine = lines.find(
        (l) => Math.abs(l.y - item.y) < Y_THRESHOLD &&
          // 2단일 때 좌/우 열의 같은 높이 줄은 별도 줄로 처리
          (!isTwoColumn || isSameColumn(l.items[0], item, midX))
      );

      if (existingLine) {
        existingLine.items.push(item);
      } else {
        lines.push({ y: item.y, items: [item] });
      }
    }

    // 각 줄 내에서 x좌표 순서로 정렬 후 텍스트 합침
    const pageText = lines
      .map((line) => {
        line.items.sort((a, b) => a.x - b.x);
        return line.items.map((i) => i.str).join(" ");
      })
      .join("\n");

    allPagesText.push(pageText);
  }

  return allPagesText.join("\n\n");
}

/** 두 아이템이 같은 열(좌/우)에 있는지 확인 */
function isSameColumn(a: TextItem, b: TextItem, midX: number): boolean {
  const aIsLeft = a.x + a.width / 2 < midX;
  const bIsLeft = b.x + b.width / 2 < midX;
  return aIsLeft === bIsLeft;
}
