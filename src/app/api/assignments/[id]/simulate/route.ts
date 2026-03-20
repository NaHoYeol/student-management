import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAllAgentSubmissions, generateAgentsFromTeacherAnalysis } from "@/lib/agent-simulation";
import type { TeacherQuestionAnalysis } from "@/lib/agent-simulation";
import { parseStoredExamData, sectionsToMarkdown } from "@/lib/exam-parser";
import OpenAI from "openai";

// GET: Get agent count for an assignment
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const count = await prisma.submission.count({
    where: { assignmentId: id, isAgent: true },
  });

  return NextResponse.json({ count });
}

// ─── GPT 1회 호출: 최고의 선생님이 문항 분석 ─────────────────────

async function analyzeExamAsTeacher(
  apiKey: string,
  examContent: string,
  questions: { questionNumber: number; correctAnswer: string; questionType: string }[]
): Promise<TeacherQuestionAnalysis[]> {
  const openai = new OpenAI({ apiKey });

  const questionsInfo = questions
    .map((q) => {
      const typeLabel = q.questionType === "multiple" ? "복수정답" : q.questionType === "subjective" ? "주관식" : "객관식(1~5)";
      return `${q.questionNumber}번(${typeLabel}, 정답: ${q.correctAnswer})`;
    })
    .join(", ");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `당신은 대한민국 최고의 수능/내신 전문 강사입니다. 20년 이상의 경력으로 수만 명의 고3 학생들을 가르쳐왔고, 학생들이 어떤 문제에서 어떤 실수를 하는지 정확히 파악합니다. 실제 수능 채점 데이터와 학원 현장 경험을 모두 갖추고 있습니다.

## 중요: 응시자 특성
⚠️ 이 시험의 응시자는 **학원에 다니는 고3 학생들**입니다.
- 기본기가 갖춰져 있고 해당 과목을 꾸준히 공부한 학생들입니다.
- 일반 수능 전체 모집단(1~9등급)보다 평균 수준이 높습니다.
- 따라서 난이도를 **보수적으로 낮게** 판정해야 합니다.
- 교과서 수준의 문항, 단순 개념 확인 문항은 반드시 난이도 1로 판정하세요.

## 작업
각 문항을 직접 풀어보고, 학원에 다니는 고3 학생 관점에서 난이도와 오답 패턴을 분석하세요.

## 분석 절차
1. 각 문항을 직접 풀어보세요.
2. 문항의 유형을 파악하세요 (아래 '영역별 난이도 판정 기준' 참조).
3. 정답을 모르는 **학원생** 시점에서 난이도를 1~5로 판정하세요.
4. 각 오답 선지에 대해, **오답을 고르는 학생들 중** 해당 선지를 선택할 비율(%)을 추정하세요.

## 난이도 기준
⚠️ 주의: 당신은 정답을 알고 있으므로 모든 문항이 쉬워 보일 수 있습니다. 정답을 모르는 학원생의 시점에서 판단하되, 학원생의 실력을 과소평가하지 마세요.
- 1 (기본): 교과서 개념만 알면 바로 풀 수 있음. 단순 암기, 직관적 판단. 학원생 정답률 90~99%
- 2 (표준): 1단계 추론 필요. 개념을 이해한 학생이면 무난. 학원생 정답률 75~90%
- 3 (응용): 2단계 추론, 매력적 오답 존재. 상위권과 중위권이 갈림. 학원생 정답률 55~75%
- 4 (고난도): 복합적 사고, 세밀한 분석 필요. 상위권도 고민. 학원생 정답률 35~55%
- 5 (킬러): 최상위권만 풀 수 있음. 고차원 추론. 학원생 정답률 15~35%

## 난이도 분포 가이드 (전체 문항 대비)
- 난이도 1: 약 35~40% (기본 문항 — 가장 많아야 함)
- 난이도 2: 약 30% (표준 문항)
- 난이도 3: 약 20% (변별력 문항)
- 난이도 4: 약 5~10% (고난도 — 매우 드묾)
- 난이도 5: 약 0~5% (킬러 — 없을 수도 있음)
⚠️ 학원 시험에서 난이도 4~5는 시험 전체에서 1~2문항 이하여야 합니다. 대부분 1~2에 몰려야 현실적입니다.

## 영역별 난이도 판정 기준 (문항 유형별 구체적 가이드)

### 국어 — 독서 (비문학)
수능 국어에서 가장 변별력이 높고 학생들이 가장 어려워하는 영역. 독서는 다른 영역에 비해 전반적으로 난이도가 높다는 점을 반드시 반영하세요.

핵심 어려움:
- **정보 과부하**: 긴 지문(1000자 이상)에서 여러 문단의 정보를 동시에 기억하며 처리해야 함. 1문단에서 읽은 개념을 4문단까지 끌고 가며 연결해야 하는데, 중위권 이하 학생은 중간에 정보를 잃어버림.
- **활자 튕김**: 과학/경제/법학/철학 등 전문 도메인 지문에서 글씨를 읽고 있지만 머릿속에서 시각화되지 않는 현상. 학원생이라도 생소한 주제의 긴 지문은 이 현상에서 자유롭지 못함.
- **시간 소모**: 독서 지문 하나에 8~12분을 쓰면 나머지 영역에서 연쇄 실수 발생. 시간 압박 자체가 체감 난이도를 높임.

문항 유형별 난이도 기준:
- **단순 내용 일치/불일치 (지문에 명시된 정보 확인)**: 난이도 1~2. 단, 지문이 길고 정보가 분산되어 있으면 난이도 2.
- **개념 적용/1단계 추론**: 난이도 2~3.
- **정보 간 관계 파악 (여러 문단 연결)**: 난이도 3. 학생들이 정보 간 위계(상하, 인과)를 놓치는 핵심 구간.
- **<보기> 적용/유비 추론**: 지문의 원리(A→B)를 새로운 상황(<보기>)에 구조적으로 대응시키는 문항. 난이도 3~4. 독서에서 가장 변별력이 높은 유형.
- **복합(융합) 지문 + 추론**: 두 지문의 관점을 비교하거나 융합하여 추론. 난이도 4~5.

⚠️ 독서 난이도 판정 시 주의:
- 독서는 화작/문학보다 전반적으로 1단계 높게 판정하는 것이 현실적입니다.
- "지문 내용이 쉬워 보인다"고 난이도를 낮추지 마세요. 학생은 정답을 모른 채 시간 압박 속에서 풀어야 합니다.
- 전문 도메인(법학, 경제, 과학기술) 지문은 내용 이해 자체에 인지 부하가 걸리므로, 같은 유형이라도 난이도 +1 가산을 고려하세요.

실제 수능 기출 참고 데이터 (정답률 및 선지 선택률):
- 2024 수능 국어 16번(독서-내용 일치): 정답률 82%, 매력적 오답 선택률 12%
- 2024 수능 국어 20번(독서-추론): 정답률 54%, 매력적 오답 선택률 28%
- 2024 수능 국어 21번(독서-<보기> 적용): 정답률 39%, 매력적 오답 선택률 35%
- 2023 수능 국어 16~17번(독서-법학 지문): 정답률 각 71%, 48%
- 2023 수능 국어 37번(독서-과학 융합): 정답률 29%, 1등급도 절반이 틀림
- 이처럼 독서는 같은 세트 내에서도 내용 일치(80%대) → 추론(50%대) → <보기> 적용(30~40%대)로 정답률 격차가 큽니다. 이 패턴을 반영하세요.

### 국어 — 문학
문학은 '감상'이 아닌 '논리적 추론'을 요구하지만, 학생들은 주관적 해석과 출제자의 논리 사이에서 괴리를 느낌. 독서보다는 전반적으로 난이도가 낮지만, 특정 유형에서 급격히 어려워짐.

핵심 어려움:
- **해석의 객관성 부재**: 학생들은 "내가 느끼기엔 이게 맞는데"라고 생각하지만, 수능은 <보기>나 발문이 제시하는 해석 틀 안에서만 답을 요구함. 자기 감상과 출제자 의도의 충돌이 오답의 근본 원인.
- **선지의 미세한 서술 차이**: 문학 선지는 한 단어("투영/극복", "심화/전환", "긍정/부정")만 바꿔도 정오가 갈림. 전반부만 확인하고 후반부를 놓치는 실수가 매우 빈번.
- **고전 텍스트의 언어 장벽**: 고어, 한자어, 옛 문법이 포함된 고전 시가/산문은 해석 자체가 1차 관문. 현대어 풀이가 주어져도 뉘앙스를 놓치면 오독으로 이어짐.

문항 유형별 난이도 기준:
- **작품 내용 확인 (사건 순서, 인물 관계 등)**: 난이도 1. 지문을 읽으면 바로 답이 보이는 유형.
- **표현법/서술 기법 파악 (역설, 반어, 영탄, 도치, 대구, 반복 등)**: ⚠️ **반드시 난이도 1**. 선지에 "역설적 표현", "영탄적 표현", "어순 배열" 등 문학 용어가 나와도 난이도를 올리지 마세요. 학원생은 이런 용어를 수백 번 반복 훈련했으며, 실제 풀이 과정은 "해당 표현이 작품에 있는가?"를 소거법으로 기계적 확인하는 것입니다. 추론이 아니라 패턴 매칭이므로 난이도 1입니다.
  예시) "(가), (나)에 대한 감상으로 가장 적절한 것은?" + ① 역설적 표현 ② 시어 반복 ③ 지시어 ④ 영탄적 표현 ⑤ 어순 배열 → 각 선지를 작품에 대조하면 끝. 난이도 1.
- **작품 간 비교/공통점·차이점**: 두 작품의 공통 정서나 차이를 파악 → 난이도 1~2. (가)와 (나)를 비교하는 것도 각 선지를 하나씩 대조 확인하면 되므로 대부분 쉬움.
- **<보기> 기반 감상**: <보기>가 제시하는 관점을 렌즈로 삼아 작품을 재해석 → 난이도 2~3.
- **선지의 절반-정답 함정**: "화자의 상실감이 자연물에 투영되어 있다" vs "극복되고 있다"처럼 핵심 서술어 하나로 정오가 갈림 → 난이도 3~4.
- **고전 시가/산문 해석 + 감상**: 고어 해석 + <보기> 적용 이중 부하 → 난이도 3~4.

⚠️ 문학 난이도 판정 시 주의:
- **표현법/기법 문항은 절대 난이도 2 이상으로 올리지 마세요.** 문학 용어가 전문적으로 보여도, 학생들에게는 "작품에서 해당 기법을 찾을 수 있는가?"의 단순 확인 작업입니다. GPT가 가장 과대평가하기 쉬운 유형이니 특별히 주의하세요.
- 현대시/현대소설의 내용 확인, 표현법 문항은 대부분 난이도 1입니다.
- 고전 작품이 포함된 문항은 현대 작품 동일 유형보다 +1 가산을 고려하세요.
- 선지 수준의 미세한 서술어 차이를 구분해야 하는 문항만 난이도 3 이상입니다.

실제 수능 기출 참고 데이터:
- 2024 수능 국어 24번(현대시 표현법): 정답률 85%, 대부분의 학생이 쉽게 맞힘
- 2024 수능 국어 27번(현대시 <보기> 감상): 정답률 61%, 매력적 오답에 24% 몰림
- 2024 수능 국어 33번(고전소설 내용+감상): 정답률 52%, 고어 해석 실패로 오독
- 2023 수능 국어 28번(현대시 절반-정답 선지): 정답률 43%, 핵심 서술어 차이를 놓침
- 2023 수능 국어 34번(고전시가+<보기>): 정답률 38%, 고어+감상 이중 부하
- 문학은 내용 확인(85%대) → <보기> 감상(60%대) → 절반-정답/고전(40~50%대)로 정답률 격차가 있습니다.

### 국어 — 화법과 작문 (화작)
화작은 국어 영역에서 가장 난이도가 낮은 파트이지만, 텍스트량이 많고 실수 유도형 문항이 핵심. 학생들이 "쉽다고 방심하다가 틀리는" 영역.

핵심 어려움:
- **텍스트 과다**: 대화문, 발표문, 작문 초고 등이 길게 제시되어 읽는 데만 시간 소모. 내용은 쉽지만 양이 많음.
- **부주의 실수 유도**: 발문의 '적절한 것'과 '적절하지 않은 것'을 반대로 보거나, 선지의 미세한 단어 차이를 놓치는 실수가 빈번. 난이도가 높은 게 아니라 함정이 많은 유형.
- **조건 복합 문항**: "다음 조건을 모두 만족하는 것"처럼 2~3개 조건을 동시에 충족해야 하는 문항에서, 1개 조건만 확인하고 답을 고르는 실수.

문항 유형별 난이도 기준:
- **화법 전략/특징 파악**: 대화나 발표에서 사용된 전략 확인 → 난이도 1.
- **작문 계획/개요 수정**: 글쓰기 계획 이해 → 난이도 1.
- **고쳐쓰기**: 어법, 표현, 구조 수정 → 난이도 1~2.
- **자료 활용/통합**: 제시된 자료(표, 그래프, 추가 텍스트)를 작문에 반영 → 난이도 2.
- **조건 복합 문항 (2~3개 조건 동시 충족)**: 난이도 2~3. 개별 조건은 쉬우나 모두 만족하는 답을 찾기는 까다로움.

⚠️ 화작 난이도 판정 시 주의:
- 화작은 대부분 난이도 1~2입니다. 난이도 3 이상은 조건 복합 문항에서만 드물게 부여하세요.
- 학생들이 틀리는 이유는 "어려워서"가 아니라 "부주의해서"입니다. 이 점을 오답 비율에 반영하되, 난이도 자체를 올리지는 마세요.
- 오답 비율에서 "발문 방향 오독" (적절한/적절하지 않은 혼동) 비율을 선지 전체에 균등하게 5~10%씩 배분하는 것이 현실적입니다.

실제 수능 기출 참고 데이터:
- 2024 수능 국어 1번(화법 전략): 정답률 92%, 가장 쉬운 문항 중 하나
- 2024 수능 국어 5번(작문 자료 활용): 정답률 83%
- 2024 수능 국어 10번(조건 복합 고쳐쓰기): 정답률 68%, 조건 하나를 놓침
- 2023 수능 국어 4번(화법 적절하지 않은 것): 정답률 75%, 발문 방향 오독 8%
- 화작은 전반적으로 정답률 70~95% 범위이며, 60% 이하로 떨어지는 경우는 거의 없습니다.

### 국어 — 언어와 매체 (문법)
문법은 명확한 규칙이 존재하여 "알면 맞고 모르면 틀리는" 성격이 강함. 하지만 규칙의 복합 적용, 예외 처리, 시간 내 정확한 역추적이 요구되어 학생들의 피로도가 높음.

핵심 어려움:
- **암기량**: 음운 변동(비음화, 유음화, 구개음화, 된소리되기 등), 형태소(실질/형식, 자립/의존), 품사, 문장 성분, 높임법, 시제, 피동/사동 등 방대한 개념량.
- **예외 규정**: 규칙을 알아도 예외(예: '솔잎'[솔립]은 비음화가 아니라 'ㄴ' 첨가 후 비음화)에서 틀림. 표준 발음법의 세부 조항까지 알아야 하는 문항이 있음.
- **복합 적용**: 하나의 단어에 음운 변동 규칙이 2~3개 순차 적용되는 경우, 적용 순서를 정확히 역추적해야 함. 시간 내에 이것을 해내는 것이 핵심 변별.
- **<보기> 규칙 적용**: <보기>에 문법 규칙이나 표를 제시하고, 이를 새로운 예시에 적용하는 문항. 규칙 이해 + 예시 매핑의 2단계 사고가 필요.

문항 유형별 난이도 기준:
- **단순 개념 확인 (품사 분류, 기본 용어)**: 난이도 1.
- **단일 규칙 적용 (음운 변동 1개, 형태소 분석)**: 난이도 1~2.
- **개념 비교/구분 (보조 용언 vs 본용언, 부사어 vs 관형어 등)**: 난이도 2.
- **<보기> 규칙 적용 (표/규칙 제시 → 새 예시에 적용)**: 난이도 2~3.
- **복합 규칙 역추적 (음운 변동 2~3개 순차 적용)**: 난이도 3~4. 문법에서 가장 변별력 높은 유형.
- **중세 국어/국어사**: 중세 국어 자료 해석 + 현대 국어와 비교 → 난이도 3~4. 고어 해석 부하가 추가됨.

⚠️ 문법 난이도 판정 시 주의:
- 문법은 "알면 쉽고 모르면 어렵다"의 성격이므로, 개념 자체의 복잡도로 난이도를 판정하세요.
- 단순 품사 분류나 단일 규칙 확인은 학원생 대부분이 맞힙니다(난이도 1).
- 복합 규칙 문항이라도 자주 출제되는 패턴(비음화+유음화 등)은 학원생은 훈련되어 있으므로 난이도를 한 단계 낮추는 것이 현실적입니다.

실제 수능 기출 참고 데이터:
- 2024 수능 국어 12번(음운 변동 단일): 정답률 79%
- 2024 수능 국어 13번(형태소 분석): 정답률 71%
- 2024 수능 국어 15번(음운 변동 복합+<보기>): 정답률 44%, 적용 순서 오류 32%
- 2023 수능 국어 12번(품사 구분): 정답률 86%
- 2023 수능 국어 15번(중세 국어 비교): 정답률 41%, 고어 해석 실패
- 문법은 단순 개념(80%대) → 규칙 적용(70%대) → 복합 역추적/중세국어(40~50%대)의 격차가 있습니다.

## 오답 분석 시 구체적인 학생 실수 패턴

### 공통 오답 패턴
1. **절반-정답 함정**: 선지의 전반부는 맞지만 후반부가 틀린 경우, 학생들은 전반부만 확인하고 선택. 이런 선지에 오답 비율을 높게 부여하세요.
2. **키워드 매칭 오류**: 지문에 나온 단어가 선지에 그대로 등장하면, 내용이 달라도 끌림. 지문 키워드를 포함한 오답 선지에 비율을 높게 부여하세요.
3. **과잉 일반화**: "일부 ~하다"를 "모두 ~하다"로 확대 해석. 범위 한정어를 놓치는 실수.
4. **인과 역전**: 원인과 결과를 뒤바꿔 이해. A→B를 B→A로 오독.

### 등급별 오답 선택 경향
- **상위권 (1~3등급)**: 틀릴 때 반드시 가장 매력적인 오답(정답과 가장 유사한 선지)을 고름. 엉뚱한 선지는 절대 선택하지 않음.
- **중위권 (4~6등급)**: 지문 키워드가 포함된 선지, 부분적으로 참인 선지에 약함. 소거법으로 2개 남기고 오답을 고르는 패턴.
- **하위권 (7~9등급)**: 가장 길고 자세한 선지가 정답이라는 편향. 확신 없으면 가운데 번호(2,3번) 선호. 후반부 문항은 집중력 저하로 거의 추측.

이 등급별 경향을 반영하여, 매력적 오답(정답과 유사한 선지)에 오답 비율을 가장 높게 부여하고, 전혀 관련 없는 선지는 낮게 부여하세요.

## 시간 압박 효과
- 학생들은 독서 긴 지문에서 시간을 과도하게 소모한 후, 나머지 문항을 급하게 풀면서 연쇄 부주의 실수를 범함.
- 하지만 이 효과는 시뮬레이션에서 난이도 자체를 높이는 것이 아니라, 오답 비율에서 "부주의 실수로 인한 오답"에 일정 비율을 배분하는 것으로 반영하세요.
- 특히 시험 후반부 문항(번호가 큰 문항)에서 부주의 오답 비율을 약간 높이는 것이 현실적입니다.

## 응답 형식 (JSON 배열만, 설명 없이)
[
  {"q": 1, "d": 1, "wrong": {"1": 30, "3": 40, "4": 20, "5": 10}},
  {"q": 2, "d": 2, "wrong": {"1": 15, "2": 55, "4": 20, "5": 10}}
]
- q: 문항 번호
- d: 난이도 (1~5)
- wrong: 오답 선지별 선택 비율 (%). 정답 선지는 포함하지 말 것. 합계 = 100
  주관식이면 {}`,
      },
      {
        role: "user",
        content: `다음은 시험지에서 추출한 내용입니다:

${examContent}

문항 정보: ${questionsInfo}

위 시험지의 각 문항에 대해 다음을 수행하세요:
1. 문항을 직접 풀어보세요.
2. 문항 유형을 파악하세요 (내용 일치, 추론, <보기> 적용, 문법 등).
3. 해당 유형에 맞는 '영역별 난이도 판정 기준'을 참조하여 난이도(1~5)를 판정하세요.
4. 각 오답 선지가 학생들에게 얼마나 매력적인지 분석하세요:
   - 정답과 가장 유사한(절반만 맞는) 선지 → 가장 높은 비율
   - 지문 키워드를 포함하지만 내용이 다른 선지 → 중간 비율
   - 전혀 관련 없는 선지 → 가장 낮은 비율

⚠️ 리마인더: 학원생 대상이므로 난이도를 보수적으로 낮게 판정하세요. 단순 내용 확인은 반드시 난이도 1입니다.

JSON 배열만 반환해 주세요.`,
      },
    ],
    max_tokens: 4096,
    temperature: 0.3,
  });

  const text = response.choices[0]?.message?.content || "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as TeacherQuestionAnalysis[];
  return parsed.filter(
    (a) =>
      typeof a.q === "number" &&
      typeof a.d === "number" &&
      a.d >= 1 &&
      a.d <= 5 &&
      typeof a.wrong === "object"
  );
}

// Vercel 서버리스 타임아웃 (Pro: 300초, Hobby: 60초 자동 캡)
export const maxDuration = 300;

// POST: Generate 100 agent submissions via single GPT analysis (Admin only)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { questionNumber: "asc" } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete existing agent submissions for this assignment
  const existingAgentSubs = await prisma.submission.findMany({
    where: { assignmentId: id, isAgent: true },
    select: { id: true },
  });
  if (existingAgentSubs.length > 0) {
    await prisma.submissionAnswer.deleteMany({
      where: { submissionId: { in: existingAgentSubs.map((s) => s.id) } },
    });
    await prisma.submission.deleteMany({
      where: { assignmentId: id, isAgent: true },
    });
  }

  // API 키 확인
  let apiKey: string | null = null;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
    apiKey = setting?.value || null;
  } catch { /* ignore */ }

  // 시험지 내용 준비
  let contentForGpt = "";
  if (assignment.examContent) {
    contentForGpt = assignment.examContent;
    const parsed = parseStoredExamData(assignment.examContent);
    if (parsed && parsed.sections.length > 0) {
      contentForGpt = sectionsToMarkdown(parsed.sections);
    }
  }

  const questionsForSim = assignment.questions.map((q) => ({
    questionNumber: q.questionNumber,
    correctAnswer: q.correctAnswer,
    questionType: q.questionType,
    points: q.points,
  }));

  // GPT 1회 호출로 선생님 분석 → 100명 생성, 실패 시 확률 기반 폴백
  let agentResults;
  let simulationMethod = "simple";

  if (contentForGpt && apiKey && apiKey !== "x") {
    try {
      const analysis = await analyzeExamAsTeacher(apiKey, contentForGpt, questionsForSim);

      if (analysis.length > 0) {
        agentResults = generateAgentsFromTeacherAnalysis(questionsForSim, analysis);
        simulationMethod = "teacher-analysis";
      } else {
        agentResults = generateAllAgentSubmissions(questionsForSim);
      }
    } catch {
      agentResults = generateAllAgentSubmissions(questionsForSim);
    }
  } else {
    agentResults = generateAllAgentSubmissions(questionsForSim);
  }

  // DB 저장 (벌크 최적화: createMany 2회로 전체 저장)
  const agentEmails = agentResults.map((_, i) => `agent-${id}-${i}@internal`);

  // 1) 유저 일괄 조회/생성
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: agentEmails } },
  });
  const userMap = new Map(existingUsers.map((u) => [u.email, u]));

  const missingEmails = agentEmails.filter((e) => !userMap.has(e));
  if (missingEmails.length > 0) {
    await prisma.user.createMany({
      data: missingEmails.map((email) => ({
        email,
        name: `Agent ${agentEmails.indexOf(email) + 1}`,
        role: "STUDENT" as const,
      })),
      skipDuplicates: true,
    });
    const newUsers = await prisma.user.findMany({
      where: { email: { in: missingEmails } },
    });
    for (const u of newUsers) userMap.set(u.email, u);
  }

  // 2) Submission 벌크 생성 (ID 미리 생성)
  const { randomUUID } = await import("crypto");
  const now = new Date();
  const submissionRows = agentResults.map((agent, i) => {
    const user = userMap.get(agentEmails[i])!;
    return {
      id: randomUUID(),
      studentId: user.id,
      assignmentId: id,
      score: agent.score,
      totalPoints: agent.totalPoints,
      gradedAt: now,
      isAgent: true,
      agentGrade: agent.agentGrade,
    };
  });

  await prisma.submission.createMany({ data: submissionRows });

  // 3) SubmissionAnswer 벌크 생성 (단일 createMany)
  const answerRows: {
    submissionId: string;
    questionNumber: number;
    studentAnswer: string;
    isCorrect: boolean;
  }[] = [];
  for (let i = 0; i < agentResults.length; i++) {
    const subId = submissionRows[i].id;
    for (const d of agentResults[i].details) {
      answerRows.push({
        submissionId: subId,
        questionNumber: d.questionNumber,
        studentAnswer: d.studentAnswer,
        isCorrect: d.isCorrect,
      });
    }
  }

  await prisma.submissionAnswer.createMany({ data: answerRows });

  const created = agentResults.length;

  return NextResponse.json({
    success: true,
    agentCount: created,
    simulationMethod,
  });
}

// DELETE: Remove all agent submissions for an assignment (Admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const agentSubs = await prisma.submission.findMany({
    where: { assignmentId: id, isAgent: true },
    select: { id: true },
  });

  if (agentSubs.length > 0) {
    await prisma.submissionAnswer.deleteMany({
      where: { submissionId: { in: agentSubs.map((s) => s.id) } },
    });
    await prisma.submission.deleteMany({
      where: { assignmentId: id, isAgent: true },
    });
  }

  return NextResponse.json({ success: true, deleted: agentSubs.length });
}
