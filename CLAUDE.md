# 기술 규칙

- 프론트엔드는 순수 HTML/CSS/JS로 구현한다 (프레임워크·빌드 도구 없음).
- 파일은 `index.html`, `style.css`, `app.js` 3개로 유지한다.
- 분석 데이터(분석 결과·키워드·인사이트)는 Supabase DB에 저장한다 (프로젝트: `samsung_ai`, id `wdciuciczkhirihersei`, 테이블: `analyses`/`analysis_keywords`/`analysis_insights`). 커스텀 백엔드 서버(Node/FastAPI 등)는 두지 않으며, 서버 로직이 필요하면 Supabase Edge Function으로 처리한다.
- 브라우저 `localStorage`는 기기 로컬 상태(분석 히스토리 캐시, API 키 등)에 한해 계속 사용한다.
- Claude API 키를 브라우저 `localStorage`에 평문 저장하는 현재 방식은 배포 전 반드시 재검토한다 (예: Supabase Edge Function 뒤로 숨기기). 해결 전까지는 개인/로컬 사용 전용으로 간주한다.

# 작업 규칙

- 표는 마크다운 표로 작성한다.
- 금액은 억원 단위로 표기한다.
- 결론을 가장 먼저 제시하고, 근거는 뒤에 정리한다.
- 수치를 제시할 때는 계산 근거(원본 값, 계산식, 출처/페이지 등)를 함께 표시한다.
- 한 번에 한 태스크만 진행한다.
- 변경 후에는 반드시 브라우저에서 확인한다.
