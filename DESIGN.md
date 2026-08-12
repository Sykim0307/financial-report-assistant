## Overview

"금융 리포트 이해 보조 어시스턴트"는 사진이나 마케팅 카피가 없는 **텍스트 중심 업무 도구**다. 이전 버전은 BMW M(자동차 마케팅 사이트)의 풀블리드 사진 기반 다크 시스템을 그대로 옮겨왔는데, 이 앱엔 사진이 없어 빈 검은 캔버스만 남고 카드에 깊이감이 없어 "고급스러움" 대신 "휑함"으로 읽혔다.

새 시스템은 Linear/Vercel/Notion류의 **다크 SaaS 대시보드** 톤을 참조한다. 순검정 대신 미세하게 푸른 기가 도는 다크 네이비 캔버스 위에, 얕은 표면 레이어(surface-1/2/3)와 부드러운 그림자로 입체감을 만들고, 단일 액센트 컬러(인디고)로 활성 상태·CTA·포커스를 통일해서 표시한다. 모서리는 둥글게(6~12px), 배지/빈 상태에는 아이콘을 더해 텍스트만 있는 화면도 채워진 느낌을 준다.

**Key Characteristics:**
- 순검정이 아닌 미세한 네이비 톤 캔버스(`{colors.canvas}` — #0a0b0f) 위에 3단계 표면 레이어로 입체감을 낸다.
- 단일 액센트 컬러(인디고, `{colors.accent}` — #6c6ff2)가 활성 탭·기본 버튼·포커스 링·링크를 전담한다. 여러 브랜드 컬러를 섞지 않는다.
- 대문자·레터스페이싱 라벨은 최소화하고, 문장 그대로의 자연스러운 대소문자를 기본으로 쓴다(작은 라벨 제외).
- 카드/버튼/인풋 모두 둥근 모서리(`{rounded.md}` 8px, `{rounded.lg}` 12px)를 기본으로 하고, 얕은 그림자로 표면을 띄운다.
- 빈 상태(결과 없음, 히스토리 없음)는 아이콘 + 중앙 정렬 텍스트로 채워, 큰 여백이 "비어 보이는" 느낌을 주지 않게 한다.
- 배지는 테두리만 있는 칩이 아니라 배경색이 은은하게 채워진 소프트 칩으로 표시해 상태(기회/리스크/참고)를 색으로 즉시 구분한다.

## Colors

### Brand & Accent
- **Accent** (`{colors.accent}` — #6c6ff2): 유일한 브랜드 액센트. 기본 버튼, 활성 탭, 포커스 링, 링크에 사용한다.
- **Accent Hover** (`{colors.accent-hover}` — #7d80f5): 액센트 버튼 hover 상태.
- **Accent Soft** (`{colors.accent-soft}` — rgba(108,111,242,0.16)): 활성 탭 배경, 포커스 링 배경 등 은은한 틴트.

### Surface
- **Canvas** (`{colors.canvas}` — #0a0b0f): 페이지 바탕. 순검정이 아닌 미세한 네이비 톤.
- **Surface 1** (`{colors.surface-1}` — #121319): 헤더, 1단계 표면.
- **Surface 2** (`{colors.surface-2}` — #191b22): 카드, 인풋 배경.
- **Surface 3** (`{colors.surface-3}` — #22242e): 카드 위에 얹는 중첩 요소(히스토리 행 hover 등).

### Border & Text
- **Border** (`{colors.border}` — rgba(255,255,255,0.08)): 카드/인풋 기본 테두리.
- **Border Strong** (`{colors.border-strong}` — rgba(255,255,255,0.16)): 포커스/hover 시 테두리.
- **Text** (`{colors.text}` — #f2f3f7): 제목, 강조 텍스트.
- **Text Muted** (`{colors.text-muted}` — #9296a8): 본문, 라벨, 캡션.
- **Text Faint** (`{colors.text-faint}` — #5c6072): 빈 상태 아이콘, 플레이스홀더.

### Semantic
- **Success / 기회** (`{colors.success}` — #34d399, 배경 rgba(52,211,153,0.14)): 인사이트 "기회" 배지.
- **Danger / 리스크** (`{colors.danger}` — #f87171, 배경 rgba(248,113,113,0.14)): 인사이트 "리스크" 배지, 에러 메시지.
- **Neutral 배지** (`{colors.neutral}` — #9296a8, 배경 rgba(146,150,168,0.14)): "참고" 배지.

## Typography

### Font Family
시스템 산세리프 스택: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", Roboto, Arial, sans-serif`. 한글이 주 언어이므로 Malgun Gothic / Apple SD Gothic Neo를 명시적으로 포함한다.

### Hierarchy

| Token | Size | Weight | Use |
|---|---|---|---|
| `{typography.h1}` | 17px | 700 | 헤더 앱 타이틀 |
| `{typography.h2}` | 24px | 700 | 화면 제목 (문장 그대로, 대문자 강제 없음) |
| `{typography.h3}` | 16px | 600 | 카드 제목 (결과 블록) |
| `{typography.label}` | 13px | 600 | 폼 라벨 (문장 그대로, 은은한 색) |
| `{typography.body}` | 15px | 400 | 기본 본문 |
| `{typography.small}` | 13px | 400 | 캡션, 보조 설명, 인용 |
| `{typography.button}` | 14px | 600 | 버튼/탭 라벨 |
| `{typography.badge}` | 12px | 600 | 배지 라벨 |

### Principles
BMW식 "무게 대비(700 display / 300 body)"와 전면 대문자 트래킹은 걷어냈다 — 텍스트 중심 도구에서는 가독성이 우선이므로 대부분 400~600 사이 무게를 쓰고, 대문자는 배지처럼 아주 작은 라벨에만 남긴다.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px.
- BMW 원본의 96px 섹션 간격은 사진이 없는 이 앱에서 빈 공간만 키우므로 32~48px로 축소했다.

### Grid & Container
- **Max content width:** 720px, 중앙 정렬. 텍스트 읽기에 적합한 좁은 컬럼.
- **화면 전환:** 상단 탭 네비게이션 + 단일 컬럼 콘텐츠 (사이드바 없음 — 화면 4개뿐이라 오버엔지니어링).

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | 그림자 없음 | 헤더, 페이지 바탕 |
| Card | `{colors.surface-2}` 배경 + `{colors.border}` 1px + 부드러운 그림자(`0 1px 2px rgba(0,0,0,.3), 0 8px 24px -16px rgba(0,0,0,.5)`) | 결과 카드, 인풋 |
| Hover | 그림자 강도 증가 + `{colors.border-strong}` | 히스토리 행, 카드 hover |
| Focus | `{colors.accent}` 2px 링 + `{colors.accent-soft}` 배경 확산 | 인풋/버튼 포커스 |

BMW 원본의 "그림자 없음, 사진으로만 깊이감" 원칙은 사진이 없는 이 앱에 맞지 않아 폐기했다 — 대신 얕은 그림자 3단계로 표면 위계를 표현한다.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.sm}` | 6px | 인풋, 버튼 |
| `{rounded.md}` | 8px | 배지, 작은 요소 |
| `{rounded.lg}` | 12px | 카드, 결과 블록, 히스토리 행 |
| `{rounded.full}` | 9999px | 활성 탭 필(pill) 배경 |

BMW의 "직각 아니면 원형" 이분법 대신, 대부분 8~12px의 부드러운 라운드를 기본으로 쓴다 — SaaS 도구 톤에 더 맞는다.

## Components

### Top Navigation
**`top-nav`** — `{colors.surface-1}` 배경, 하단 `{colors.border}` 1px. 좌측 앱 타이틀, 우측 탭 네비게이션. 탭은 밑줄이 아니라 **필(pill) 배경**으로 활성 상태를 표시한다 — 활성 탭: `{colors.accent-soft}` 배경 + `{colors.accent}` 텍스트, `{rounded.full}`. 비활성 탭은 배경 없음, `{colors.text-muted}` 텍스트.

### Buttons
**`button-primary`** — 배경 `{colors.accent}`, 텍스트 흰색, `{rounded.sm}`, padding 10px 20px, 그림자 은은. Hover 시 `{colors.accent-hover}` + 그림자 강화. Disabled: 배경 `{colors.surface-3}`, 텍스트 `{colors.text-faint}`.

**`file-input`** — 네이티브 `<input type="file">`의 `::file-selector-button`을 `button-primary`와 같은 톤의 보조 버튼(투명 배경 + 테두리)으로 스타일링해 브라우저 기본 회색 버튼이 튀지 않게 한다.

### Cards & Containers
**`result-card`** — `{colors.surface-2}` 배경, `{colors.border}` 테두리, `{rounded.lg}`, padding 20px, 그림자(`Card` 레벨). 제목(`h3`) 앞에 작은 이모지 아이콘(요약 🧾 · 키워드 🔑 · 인사이트 💡)을 붙여 카드 성격을 한눈에 구분한다.

**`badge`** — 소프트 칩. 배경은 시맨틱 컬러의 14% 틴트, 텍스트는 해당 시맨틱 컬러, `{rounded.md}`, padding 3px 10px.

**`history-row`** — 카드형 리스트 행. `{colors.surface-2}` 배경, `{rounded.lg}`, hover 시 `{colors.surface-3}` + 살짝 이동(translateX 2px). 행 사이는 hairline이 아니라 8px 간격(`{spacing.xs}`)으로 분리한다.

**`empty-state`** — 결과/히스토리가 비었을 때 아이콘(`{colors.text-faint}` 톤) + 중앙 정렬 안내 텍스트를 세로로 쌓아 표시한다. 왼쪽 정렬 텍스트 한 줄만 덩그러니 있던 이전 버전보다 여백이 채워진 느낌을 준다.

### Inputs & Forms
**`text-input`** — `{colors.surface-2}` 배경, `{colors.border}` 테두리, `{rounded.sm}`, padding 10px 14px. 포커스 시 `{colors.accent}` 테두리 + `{colors.accent-soft}` 그림자 링.

## Do's and Don'ts

### Do
- 액센트 컬러(인디고) 하나만 상태·CTA 표시에 쓴다.
- 카드에는 항상 은은한 그림자로 표면 위계를 준다 — 그림자 없는 카드는 배경과 구분이 안 된다.
- 빈 상태는 아이콘 + 중앙 정렬로 채운다.
- 폰트 무게는 400(본문)~700(제목) 사이에서 필요한 만큼만 쓴다.

### Don't
- 대문자 전면 강제 + 넓은 레터스페이싱을 본문/제목에 쓰지 않는다 (가독성 저하).
- 사진이 없는 화면에 96px급 섹션 간격을 쓰지 않는다 — 빈 공간만 강조된다.
- 탭/배지에 그라디언트나 여러 브랜드 컬러를 섞지 않는다 — 액센트 하나로 통일.
- 네이티브 파일 인풋을 스타일링 없이 그대로 노출하지 않는다.

## Responsive Behavior

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 600px | 헤더 세로 스택, 탭 필 축소, 카드 패딩 축소, 기본 버튼 100% 너비 |
| Desktop | ≥ 600px | 기본 레이아웃 (720px 중앙 컬럼) |

## Known Gaps

- 아이콘은 별도 아이콘 폰트/SVG 스프라이트 없이 이모지로 대체했다 — 순수 HTML/CSS/JS·외부 리소스 없음 제약과 맞고, OS별 렌더링 차이는 감수한다.
- 라이트 모드는 정의하지 않았다 (다크 모드 전용 도구로 유지).
