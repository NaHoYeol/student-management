/**
 * n개 문항에 total점을 정수로 균등 분배합니다.
 * 나머지는 앞 문항부터 1점씩 추가합니다.
 *
 * 예: 30문항, 100점 → base=3, remainder=10
 *     1~10번: 4점, 11~30번: 3점 → 합계 40+60=100
 */
export function distributePoints(n: number, total = 100): number[] {
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base));
}
