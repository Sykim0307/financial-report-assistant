// 화면 뼈대 + localStorage/히스토리 + Supabase 저장 + PDF 업로드(pdf.js CDN).
// Claude 분석은 Supabase Edge Function(analyze-report)을 거쳐 호출한다 — Anthropic API 키는
// 그 함수의 서버 측 시크릿으로만 존재하고 브라우저에는 내려오지 않는다.
// 근거성 검증(태스크 4)은 아직 없음: 지금은 모델 응답이 검증 없이 그대로 표시된다.
//
// 주의: 이 파일은 일반 스크립트(type="module" 아님)로 로드된다. file://로 직접 열었을 때
// 브라우저가 로컬 모듈 스크립트 로딩을 CORS로 차단하기 때문이다. 그래서 pdf.js는 정적 import
// 대신 동적 import()로, 실제 PDF 업로드 시점에만 원격 CDN에서 불러온다(동적 import는 일반
// 스크립트에서도 허용됨).

const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build";
let pdfjsLibPromise = null;

function loadPdfJsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import(`${PDFJS_BASE}/pdf.min.mjs`).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
      return lib;
    });
  }
  return pdfjsLibPromise;
}

// Supabase 프로젝트: samsung_ai. anon(publishable) 키는 RLS로 접근이 제한되므로
// 클라이언트에 노출돼도 안전하다(설계: analyses.user_id가 NULL인 행만 anon이 CRUD 가능).
const SUPABASE_URL = "https://wdciuciczkhirihersei.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_g_OWgYOEPBNI3UXrG8jBtg_6p6smeuK";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- 인증 (Google 로그인, 선택 사항) ----------
// 로그인은 필수가 아니다: 로그인하지 않으면 지금처럼 익명(user_id NULL, 전체 공개)으로 계속 쓸 수 있고,
// 로그인하면 그 사람의 분석만 user_id로 묶여 RLS에 의해 본인에게만 보이게 된다.

let currentUser = null;

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userChip = document.getElementById("user-chip");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");

function updateAuthUI(user) {
  currentUser = user;
  if (user) {
    loginBtn.hidden = true;
    userChip.hidden = false;
    userName.textContent = user.user_metadata?.full_name || user.email || "로그인됨";
    userAvatar.src = user.user_metadata?.avatar_url || "";
    upsertProfile(user);
  } else {
    loginBtn.hidden = false;
    userChip.hidden = true;
  }
}

// 랭킹에 이름/아바타를 보여주기 위해, 로그인할 때마다 본인 프로필만 갱신해둔다.
async function upsertProfile(user) {
  try {
    await supabaseClient.from("profiles").upsert({
      id: user.id,
      display_name: user.user_metadata?.full_name || user.email || "익명",
      avatar_url: user.user_metadata?.avatar_url || null,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("프로필 저장 실패:", e);
  }
}

loginBtn.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href.split("#")[0].split("?")[0] },
  });
  if (error) {
    console.error(error);
    alert("로그인을 시작하지 못했습니다: " + error.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

supabaseClient.auth.onAuthStateChange((_event, session) => {
  updateAuthUI(session?.user || null);
  renderHistory();
  checkUsage();
});

supabaseClient.auth.getSession().then(({ data }) => {
  updateAuthUI(data.session?.user || null);
  checkUsage();
});

const HISTORY_KEY = "financial-assistant-history";
const MAX_HISTORY_ENTRIES = 30;
const MAX_STORED_INPUT_CHARS = 20000; // localStorage 용량 보호용 (원문 전체가 아니라 앞부분만 저장)
const MAX_ANALYSIS_CHARS = 40000; // 이 이상은 잘라서 보냄 (비용/응답시간/컨텍스트 한도 보호용)

// ---------- localStorage 헬퍼 ----------

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("히스토리 로드 실패:", e);
    return [];
  }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

function addHistoryEntry(entry) {
  const list = loadHistory();
  list.unshift(entry); // 최신이 앞으로
  const trimmed = list.slice(0, MAX_HISTORY_ENTRIES);
  saveHistory(trimmed);
  return trimmed;
}

// ---------- Supabase 저장 ----------

async function saveAnalysisToDb({ sourceName, sourceType, inputText, truncated, result, model, durationMs, textHash }) {
  try {
    const { data: analysisRow, error: analysisError } = await supabaseClient
      .from("analyses")
      .insert({
        user_id: currentUser?.id || null,
        source_name: sourceName,
        source_type: sourceType,
        input_text: inputText,
        input_char_count: inputText.length,
        truncated,
        report_title: result.report_title,
        key_metrics: result.key_metrics || [],
        summary: result.summary_points.join("\n"),
        model,
        duration_ms: durationMs,
        text_hash: textHash,
      })
      .select()
      .single();
    if (analysisError) throw analysisError;

    const keywordRows = result.keywords.map((kw, i) => ({
      analysis_id: analysisRow.id,
      position: i,
      term: kw.term,
      plain_explanation: kw.plain_explanation,
      source_quote: kw.source_quote,
    }));
    const insightRows = result.insights.map((ins, i) => ({
      analysis_id: analysisRow.id,
      position: i,
      insight: ins.insight,
      category: ins.category,
      source_quote: ins.source_quote,
    }));

    const [kwResult, insResult] = await Promise.all([
      keywordRows.length ? supabaseClient.from("analysis_keywords").insert(keywordRows) : Promise.resolve({ error: null }),
      insightRows.length ? supabaseClient.from("analysis_insights").insert(insightRows) : Promise.resolve({ error: null }),
    ]);
    if (kwResult.error) throw kwResult.error;
    if (insResult.error) throw insResult.error;
    return analysisRow.id;
  } catch (e) {
    console.error("Supabase 저장 실패 (localStorage 히스토리는 정상 저장됨):", e);
    return null;
  }
}

// ---------- 결과 피드백 ----------

let currentAnalysisId = null;

function showFeedbackBox(analysisId) {
  currentAnalysisId = analysisId;
  const box = document.getElementById("feedback-box");
  const upBtn = document.getElementById("feedback-up");
  const downBtn = document.getElementById("feedback-down");
  const thanks = document.getElementById("feedback-thanks");

  if (!analysisId) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  upBtn.disabled = false;
  downBtn.disabled = false;
  thanks.hidden = true;
}

async function submitFeedback(isHelpful) {
  if (!currentAnalysisId) return;
  const upBtn = document.getElementById("feedback-up");
  const downBtn = document.getElementById("feedback-down");
  const thanks = document.getElementById("feedback-thanks");

  upBtn.disabled = true;
  downBtn.disabled = true;
  try {
    const { error } = await supabaseClient.from("analysis_feedback").insert({
      analysis_id: currentAnalysisId,
      user_id: currentUser?.id || null,
      is_helpful: isHelpful,
    });
    if (error) throw error;
    thanks.hidden = false;
  } catch (e) {
    console.error("피드백 저장 실패:", e);
    upBtn.disabled = false;
    downBtn.disabled = false;
  }
}

document.getElementById("feedback-up").addEventListener("click", () => submitFeedback(true));
document.getElementById("feedback-down").addEventListener("click", () => submitFeedback(false));

// ---------- 화면 전환 ----------

const navButtons = document.querySelectorAll(".nav-btn");
const screens = document.querySelectorAll(".screen");
const sideRails = document.querySelectorAll(".side-rail");
const mainEl = document.querySelector("main");

function showScreen(targetId) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === targetId);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
  sideRails.forEach((rail) => {
    rail.classList.toggle("is-visible", targetId === "input-screen");
  });
  mainEl.classList.toggle("main--wide", targetId === "result-screen");
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.target));
});

document.getElementById("logo-link").addEventListener("click", () => showScreen("input-screen"));

// ---------- PDF 업로드 (pdf.js) ----------

// 페이지를 y좌표로 줄 단위로 묶은 뒤, 페이지 절반 이상에서 똑같이 반복되는 줄(머리말/꼬리말/
// 반복 면책조항)과 "12", "Page 12", "- 12 -" 같은 페이지 번호 패턴을 제거한다. 리포트 형식
// 문서는 이런 반복 요소가 페이지마다 붙어 실제 분석에 필요 없는 토큰을 계속 잡아먹는다.
const PAGE_NUMBER_PATTERN = /^(page\s*)?\d{1,4}(\s*\/\s*\d{1,4})?(\s*페이지)?$|^-\s*\d{1,4}\s*-$/i;

function groupItemsIntoLines(items) {
  const rows = new Map();
  items.forEach((item) => {
    const y = Math.round(item.transform[5]);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(item);
  });
  const sortedYs = [...rows.keys()].sort((a, b) => b - a);
  return sortedYs
    .map((y) =>
      rows
        .get(y)
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((it) => it.str)
        .join(" ")
        .trim()
    )
    .filter((line) => line.length > 0);
}

function removeRepeatedBoilerplate(pageLines) {
  if (pageLines.length < 3) return pageLines; // 페이지가 적으면 "반복" 판정이 의미 없음
  const lineCounts = new Map();
  pageLines.forEach((lines) => {
    new Set(lines).forEach((line) => {
      lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
    });
  });
  const majorityThreshold = Math.ceil(pageLines.length * 0.5);
  const boilerplateLines = new Set(
    [...lineCounts.entries()].filter(([, count]) => count >= majorityThreshold).map(([line]) => line)
  );
  return pageLines.map((lines) =>
    lines.filter((line) => !boilerplateLines.has(line) && !PAGE_NUMBER_PATTERN.test(line.trim()))
  );
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageLines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pageLines.push(groupItemsIntoLines(content.items));
  }
  const cleanedPages = removeRepeatedBoilerplate(pageLines);
  const text = cleanedPages
    .map((lines) => lines.join("\n"))
    .join("\n\n")
    .trim();
  return { text, numPages: pdf.numPages };
}

const fileInput = document.getElementById("file-input");
const fileStatusEl = document.getElementById("file-status");
const textInput = document.getElementById("text-input");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  fileStatusEl.textContent = "PDF에서 텍스트를 추출하는 중입니다...";
  try {
    const { text, numPages } = await extractPdfText(file);
    if (!text) {
      fileStatusEl.textContent = "텍스트를 추출하지 못했습니다 (스캔본/이미지 PDF일 수 있습니다). 텍스트를 직접 붙여넣어주세요.";
      return;
    }
    textInput.value = text;
    fileStatusEl.textContent = `추출 완료: ${file.name} (${numPages}페이지, ${text.length.toLocaleString()}자)`;
  } catch (e) {
    console.error(e);
    fileStatusEl.textContent = "PDF 텍스트 추출 실패: " + e.message;
  }
});

// ---------- 샘플 리포트 체험 ----------
// 처음 온 사용자가 자기 문서 없이도 "분석하면 이런 식으로 나오는구나"를 볼 수 있게,
// 실제 분석과 똑같은 경로(분석 시작 버튼 → Edge Function)를 타는 예시 원문을 채워준다.

const SAMPLE_REPORT_TEXT = `2026년 3분기 A전자 실적 리뷰

A전자의 2026년 3분기 영업이익은 전분기 대비 18% 증가한 1조 2천억원을 기록했다. 메모리 반도체 가격 상승과 AI 서버향 수요 확대가 실적 개선을 이끌었다. 현재 PER은 11배 수준으로 최근 5년 평균(15배)을 크게 하회하고 있어 저평가 논란이 이어지고 있다.

한편 회사는 4분기부터 신규 파운드리 라인 가동을 시작하며, 여기에 투입되는 초기 감가상각비가 매출원가율(마진)에 단기적으로 부담을 줄 수 있다는 우려가 나온다. 환율 변동성 확대에 대비해 통화 콜옵션 헤지 비중도 늘린 상태다.

경쟁사들이 유사 공정에 대규모 설비투자를 발표하면서 중장기적으로는 공급 과잉에 따른 가격 하락 리스크도 함께 거론된다.`;

const sampleBtn = document.getElementById("sample-btn");
sampleBtn.addEventListener("click", () => {
  fileInput.value = "";
  fileStatusEl.textContent = "";
  textInput.value = SAMPLE_REPORT_TEXT;
  textInput.focus();
  statusEl.classList.remove("error");
  statusEl.textContent = '샘플 리포트를 불러왔습니다. "분석 시작"을 눌러 결과를 확인해보세요.';
});

// ---------- Claude 분석 (Supabase Edge Function 경유) ----------
// Anthropic API 키는 브라우저에 두지 않는다. Edge Function(analyze-report)이
// 서버 측 시크릿(ANTHROPIC_API_KEY)으로 Claude를 호출하고 결과만 돌려준다.

async function callClaudeAnalysis(sourceText, persona) {
  const { data, error } = await supabaseClient.functions.invoke("analyze-report", {
    body: { text: sourceText, persona },
  });

  if (error) {
    // Edge Function이 4xx/5xx를 반환하면 supabase-js는 data 없이 error만 채운다.
    // 우리가 보낸 커스텀 JSON 에러 메시지(예: 사용량 초과)는 error.context(Response)에서 직접 읽어야 한다.
    let message = error.message;
    let usage = null;
    if (error.context && typeof error.context.json === "function") {
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
        if (body?.usage) usage = body.usage;
      } catch {
        // 본문이 JSON이 아니면 원래 메시지를 사용
      }
    }
    const wrapped = new Error(message);
    wrapped.usage = usage;
    throw wrapped;
  }
  if (data?.error) {
    const wrapped = new Error(data.error);
    wrapped.usage = data.usage || null;
    throw wrapped;
  }
  if (
    !data?.report_title ||
    !Array.isArray(data.summary_points) ||
    data.summary_points.length === 0 ||
    !Array.isArray(data.keywords) ||
    !Array.isArray(data.insights)
  ) {
    throw new Error("모델 응답에 report_title/summary_points/keywords/insights가 모두 없습니다.");
  }
  return data;
}

// ---------- 사용량 표시 ----------

async function checkUsage() {
  const indicator = document.getElementById("usage-indicator");
  try {
    const { data, error } = await supabaseClient.functions.invoke("analyze-report", {
      body: { checkUsageOnly: true },
    });
    if (error || !data?.usage) return;
    renderUsage(data.usage);
  } catch {
    // 사용량 조회 실패는 조용히 무시 (핵심 기능이 아님)
  }
}

function renderUsage(usage) {
  const indicator = document.getElementById("usage-indicator");
  const remaining = Math.max(0, usage.limit - usage.count);
  indicator.textContent = `오늘 사용량 ${usage.count}/${usage.limit}회${
    remaining === 0 ? "" : ` (${remaining}회 남음)`
  }${usage.isLoggedIn ? "" : " · 로그인하면 5회까지"}`;
  indicator.classList.toggle("usage-full", remaining === 0);
}

// ---------- 결과 렌더링 ----------

function renderStatTiles(keyMetrics) {
  const row = document.getElementById("stat-tile-row");
  row.innerHTML = "";
  if (!keyMetrics.length) {
    row.hidden = true;
    return;
  }
  row.hidden = false;
  keyMetrics.forEach((metric) => {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `
      <div class="stat-tile-label">${escapeHtml(metric.label)}</div>
      <div class="stat-tile-value">${escapeHtml(metric.value)}</div>
    `;
    row.appendChild(tile);
  });
}

function renderInsightMix(insights) {
  const wrap = document.getElementById("insight-mix");
  if (!insights.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;

  const counts = { opportunity: 0, risk: 0, neutral: 0 };
  insights.forEach((ins) => {
    if (counts[ins.category] !== undefined) counts[ins.category]++;
  });
  const total = insights.length;

  ["opportunity", "risk", "neutral"].forEach((cat) => {
    const pct = total ? (counts[cat] / total) * 100 : 0;
    document.getElementById(`insight-mix-seg-${cat}`).style.width = pct + "%";
  });
  document.getElementById("count-opportunity").textContent = counts.opportunity;
  document.getElementById("count-risk").textContent = counts.risk;
  document.getElementById("count-neutral").textContent = counts.neutral;
}

// ---------- 원문 패널 + 근거 하이라이트 (데스크톱 2컬럼 레이아웃) ----------

let currentSourceText = "";

function renderSourceText(text) {
  currentSourceText = text || "";
  const el = document.getElementById("source-text");
  el.textContent = currentSourceText || "원문을 표시할 수 없습니다.";
}

function highlightInSource(quote) {
  const paneEl = document.getElementById("source-pane");
  const el = document.getElementById("source-text");
  if (!currentSourceText || !quote || !paneEl.offsetParent) return;

  const idx = currentSourceText.indexOf(quote);
  if (idx === -1) return; // 모델이 원문과 살짝 다르게 인용했을 경우 조용히 무시

  const before = currentSourceText.slice(0, idx);
  const match = currentSourceText.slice(idx, idx + quote.length);
  const after = currentSourceText.slice(idx + quote.length);
  el.innerHTML = `${escapeHtml(before)}<mark id="source-highlight" class="source-highlight">${escapeHtml(match)}</mark>${escapeHtml(after)}`;

  const markEl = document.getElementById("source-highlight");
  markEl.scrollIntoView({ behavior: "smooth", block: "center" });
  markEl.classList.add("flash");
  setTimeout(() => markEl.classList.remove("flash"), 1200);
}

function renderResult(result) {
  const titleEl = document.getElementById("report-title-output");
  titleEl.textContent = result.report_title;
  titleEl.classList.remove("placeholder");

  renderStatTiles(result.key_metrics || []);
  renderInsightMix(result.insights || []);

  const summaryEl = document.getElementById("summary-output");
  summaryEl.classList.remove("placeholder");
  summaryEl.innerHTML = "";
  result.summary_points.forEach((point) => {
    const li = document.createElement("li");
    li.className = "summary-point";
    li.textContent = point;
    summaryEl.appendChild(li);
  });

  const keywordsEl = document.getElementById("keywords-output");
  keywordsEl.classList.remove("placeholder");
  keywordsEl.innerHTML = "";
  result.keywords.forEach((kw) => {
    const card = document.createElement("div");
    card.className = "keyword-card";
    card.innerHTML = `
      <div class="term">${escapeHtml(kw.term)}</div>
      <div>${escapeHtml(kw.plain_explanation)}</div>
      <div class="quote">근거: ${escapeHtml(kw.source_quote)}</div>
    `;
    card.addEventListener("click", () => highlightInSource(kw.source_quote));
    keywordsEl.appendChild(card);
  });

  const insightsEl = document.getElementById("insights-output");
  insightsEl.classList.remove("placeholder");
  insightsEl.innerHTML = "";
  result.insights.forEach((ins) => {
    const li = document.createElement("li");
    li.className = "insight-item";
    const categoryLabel = CATEGORY_LABELS[ins.category] || ins.category;
    li.innerHTML = `
      <span class="badge ${escapeHtml(ins.category)}">${escapeHtml(categoryLabel)}</span>
      ${escapeHtml(ins.insight)}
      <div class="quote">근거: ${escapeHtml(ins.source_quote)}</div>
    `;
    li.addEventListener("click", () => highlightInSource(ins.source_quote));
    insightsEl.appendChild(li);
  });
}

const CATEGORY_LABELS = {
  opportunity: "↑ 기회",
  risk: "↓ 리스크",
  neutral: "i 참고",
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- Supabase에서 기록 불러오기 ----------
// 로그인이 없어 모든 분석이 공개(anon) 행으로 저장되므로, 이 목록은 기기/브라우저에
// 상관없이 "지금까지 이 앱에서 분석된 전체 기록"을 보여준다 (개인별 구분 없음).

async function fetchRecentAnalyses() {
  const { data, error } = await supabaseClient
    .from("analyses")
    .select(
      `id, created_at, source_name, report_title, summary, model, duration_ms, key_metrics, input_text,
       analysis_keywords ( term, plain_explanation, source_quote, position ),
       analysis_insights ( insight, category, source_quote, position )`
    )
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_ENTRIES);

  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    createdAt: new Date(row.created_at).toLocaleString("ko-KR"),
    sourceName: row.source_name,
    inputText: row.input_text,
    durationMs: row.duration_ms,
    result: {
      report_title: row.report_title,
      key_metrics: row.key_metrics || [],
      summary_points: row.summary ? row.summary.split("\n") : [],
      keywords: [...row.analysis_keywords].sort((a, b) => a.position - b.position),
      insights: [...row.analysis_insights].sort((a, b) => a.position - b.position),
      model: row.model,
    },
  }));
}

// ---------- 좌우 히스토리 바로가기 카드 ----------

document.querySelectorAll(".history-peek-card").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.target));
});

function renderHistoryPeekCards(list) {
  const dynamicDescEls = document.querySelectorAll(".history-peek-desc[data-dynamic]");
  const text = list.length
    ? `최근 분석: ${list[0].result?.report_title || list[0].sourceName} · ${list[0].createdAt}`
    : "분석이 끝나면 이 카드에서 최근 결과를 바로 확인할 수 있어요.";
  dynamicDescEls.forEach((el) => {
    el.textContent = text;
  });
}

// ---------- 금융 문해력 레벨 ----------

const LEVELS = [
  { min: 0, title: "주린이" },
  { min: 3, title: "금융 꿈나무" },
  { min: 10, title: "시장 분석가" },
  { min: 25, title: "오마하의 현인" },
];

function getLevelInfo(count) {
  let current = LEVELS[0];
  let next = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (count >= LEVELS[i].min) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
    }
  }
  return { title: current.title, next };
}

async function renderLevelBadge() {
  const box = document.getElementById("level-box");
  let count = 0;
  try {
    if (currentUser) {
      const { count: dbCount, error } = await supabaseClient
        .from("analyses")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      count = dbCount || 0;
    } else {
      count = loadHistory().length;
    }
  } catch (e) {
    console.error("레벨 계산용 분석 건수 조회 실패:", e);
    box.hidden = true;
    return;
  }

  const { title, next } = getLevelInfo(count);
  const toNext = next ? `다음 레벨 "${next.title}"까지 ${next.min - count}건 남았어요.` : "최고 레벨을 달성했어요!";
  box.hidden = false;
  box.innerHTML = `
    <span class="level-badge">🏅 ${escapeHtml(title)}</span>
    <span class="level-detail">분석 ${count}건 · ${escapeHtml(toNext)}</span>
  `;
}

// ---------- 히스토리 렌더링 ----------

async function renderHistory() {
  renderLevelBadge();
  const historyList = document.getElementById("history-list");
  let list;
  try {
    list = await fetchRecentAnalyses();
  } catch (e) {
    console.error("Supabase 기록 조회 실패, 이 브라우저의 로컬 기록으로 대체:", e);
    list = loadHistory();
  }

  renderHistoryPeekCards(list);
  historyList.classList.remove("placeholder");
  historyList.innerHTML = "";

  if (list.length === 0) {
    historyList.classList.add("placeholder");
    historyList.innerHTML = "<li>저장된 분석 기록이 없습니다.</li>";
    return;
  }

  list.forEach((entry) => {
    const li = document.createElement("li");
    const title = entry.result?.report_title || entry.sourceName;
    li.textContent = `${title} · ${entry.createdAt} (${entry.durationMs}ms)`;
    li.addEventListener("click", () => {
      renderResult(entry.result);
      renderSourceText(entry.inputText || "");
      showFeedbackBox(entry.id);
      showScreen("result-screen");
    });
    historyList.appendChild(li);
  });
}

// ---------- 분석 진행률 (실제 진행률을 알 수 없어 추정치를 보여준다) ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startProgressSimulation() {
  const wrapEl = document.getElementById("analyze-progress");
  const fillEl = document.getElementById("progress-fill");
  const percentEl = document.getElementById("progress-percent");

  let percent = 0;
  fillEl.style.width = "0%";
  percentEl.textContent = "0%";
  wrapEl.hidden = false;

  // 92%까지는 점점 느려지며 채워지고, 실제로 끝나면 finish()가 100%로 마무리한다.
  const intervalId = setInterval(() => {
    percent += (92 - percent) * 0.06;
    const rounded = Math.min(92, Math.round(percent));
    fillEl.style.width = rounded + "%";
    percentEl.textContent = rounded + "%";
  }, 200);

  return {
    async finish() {
      clearInterval(intervalId);
      fillEl.style.width = "100%";
      percentEl.textContent = "100%";
      await sleep(300);
      wrapEl.hidden = true;
    },
    stop() {
      clearInterval(intervalId);
      wrapEl.hidden = true;
    },
  };
}

// ---------- 분석 시작 ----------

const analyzeBtn = document.getElementById("analyze-btn");
const statusEl = document.getElementById("analyze-status");

analyzeBtn.addEventListener("click", async () => {
  let text = document.getElementById("text-input").value.trim();

  statusEl.classList.remove("error");

  if (!text) {
    statusEl.textContent = "분석할 텍스트를 붙여넣거나 PDF를 업로드해주세요.";
    statusEl.classList.add("error");
    return;
  }

  let truncatedNote = "";
  if (text.length > MAX_ANALYSIS_CHARS) {
    text = text.slice(0, MAX_ANALYSIS_CHARS);
    truncatedNote = ` (문서가 길어 앞 ${MAX_ANALYSIS_CHARS.toLocaleString()}자만 분석했습니다)`;
  }

  analyzeBtn.disabled = true;
  statusEl.textContent = "분석 중입니다... (문서 길이에 따라 수십 초 걸릴 수 있습니다)";
  const progress = startProgressSimulation();

  const persona = document.getElementById("persona-select").value;
  const startedAt = Date.now();
  try {
    const result = await callClaudeAnalysis(text, persona);
    const durationMs = Date.now() - startedAt;
    await progress.finish();

    renderResult(result);
    renderSourceText(text);

    const sourceName = fileInput.files[0] ? fileInput.files[0].name : "직접 입력";
    const sourceType = fileInput.files[0] ? "pdf" : "text";
    addHistoryEntry({
      id: startedAt,
      createdAt: new Date(startedAt).toLocaleString("ko-KR"),
      sourceName,
      inputText: text.slice(0, MAX_STORED_INPUT_CHARS),
      result,
      durationMs,
    });
    renderHistory();

    const savedId = await saveAnalysisToDb({
      sourceName,
      sourceType,
      inputText: text,
      truncated: Boolean(truncatedNote),
      result,
      model: result.model,
      durationMs,
      textHash: result.text_hash || null,
    });
    showFeedbackBox(savedId);

    const cachedNote = result.cached ? " ⚡ 이전에 분석한 것과 같은 문서라 캐시된 결과를 바로 보여드려요." : "";
    statusEl.textContent = `분석 완료 (${(durationMs / 1000).toFixed(1)}초)${truncatedNote}${cachedNote}`;
    if (result.usage) {
      renderUsage(result.usage);
    } else {
      checkUsage();
    }
    showScreen("result-screen");
  } catch (e) {
    progress.stop();
    console.error(e);
    statusEl.textContent = e.usage ? e.message : "분석 실패: " + e.message;
    statusEl.classList.add("error");
    if (e.usage) {
      renderUsage(e.usage);
    }
  } finally {
    analyzeBtn.disabled = false;
  }
});

// ---------- 금융 용어 퀴즈 ----------
// 문제 원본은 그동안 공개(user_id NULL) 분석에서 쌓인 키워드에서만 뽑는다(get_quiz_terms 함수).
// 로그인한 사람의 비공개 분석 속 용어는 퀴즈 문제로 노출하지 않는다.

let quizQuestions = [];
let quizIndex = 0;
let quizCorrect = 0;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function startQuiz() {
  const startBox = document.getElementById("quiz-start-box");
  const playBox = document.getElementById("quiz-play-box");
  const resultBox = document.getElementById("quiz-result-box");

  const { data: terms, error } = await supabaseClient.rpc("get_quiz_terms", { p_limit: 20 });
  if (error || !terms || terms.length < 4) {
    startBox.innerHTML =
      '<p class="screen-desc">아직 퀴즈를 만들 만큼 용어가 쌓이지 않았어요. 분석을 몇 번 더 해보고 다시 와주세요!</p>';
    return;
  }

  const picked = shuffleArray(terms).slice(0, Math.min(5, terms.length));
  quizQuestions = picked.map((correct) => {
    const distractorPool = terms.filter((t) => t.term !== correct.term);
    const distractors = shuffleArray(distractorPool)
      .slice(0, 3)
      .map((t) => t.term);
    return {
      question: correct.plain_explanation,
      answer: correct.term,
      options: shuffleArray([correct.term, ...distractors]),
    };
  });
  quizIndex = 0;
  quizCorrect = 0;

  startBox.hidden = true;
  resultBox.hidden = true;
  playBox.hidden = false;
  document.getElementById("quiz-total-num").textContent = quizQuestions.length;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const q = quizQuestions[quizIndex];
  document.getElementById("quiz-current-num").textContent = quizIndex + 1;
  document.getElementById("quiz-score-num").textContent = quizCorrect;
  document.getElementById("quiz-question-text").textContent = q.question;

  const optionsEl = document.getElementById("quiz-options");
  optionsEl.innerHTML = "";
  q.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-option";
    btn.textContent = opt;
    btn.addEventListener("click", () => selectQuizOption(opt, btn));
    optionsEl.appendChild(btn);
  });
}

function selectQuizOption(selected, btnEl) {
  const q = quizQuestions[quizIndex];
  const optionsEl = document.getElementById("quiz-options");
  [...optionsEl.children].forEach((btn) => {
    btn.disabled = true;
    if (btn.textContent === q.answer) btn.classList.add("quiz-option--correct");
  });
  if (selected === q.answer) {
    quizCorrect++;
  } else {
    btnEl.classList.add("quiz-option--wrong");
  }

  setTimeout(() => {
    quizIndex++;
    if (quizIndex < quizQuestions.length) {
      renderQuizQuestion();
    } else {
      finishQuiz();
    }
  }, 900);
}

async function finishQuiz() {
  document.getElementById("quiz-play-box").hidden = true;
  const resultBox = document.getElementById("quiz-result-box");
  resultBox.hidden = false;
  document.getElementById("quiz-result-title").textContent = `${quizCorrect} / ${quizQuestions.length} 정답!`;

  const noteEl = document.getElementById("quiz-result-note");
  if (currentUser) {
    try {
      const { error } = await supabaseClient.from("quiz_scores").insert({
        user_id: currentUser.id,
        correct_count: quizCorrect,
        total_count: quizQuestions.length,
      });
      if (error) throw error;
      noteEl.textContent = "랭킹에 반영됐어요!";
    } catch (e) {
      console.error("퀴즈 점수 저장 실패:", e);
      noteEl.textContent = "점수 저장에 실패했어요. 다시 시도해주세요.";
    }
  } else {
    noteEl.textContent = "로그인하면 이 점수가 랭킹에 반영돼요.";
  }
  renderLeaderboard();
}

async function renderLeaderboard() {
  const list = document.getElementById("leaderboard-list");
  const { data, error } = await supabaseClient.rpc("get_quiz_leaderboard", { p_limit: 10 });
  if (error) {
    console.error("랭킹 조회 실패:", error);
    return;
  }
  list.innerHTML = "";
  if (!data || !data.length) {
    list.innerHTML = '<li class="placeholder">아직 랭킹에 참여한 사람이 없어요. 첫 번째 도전자가 되어보세요!</li>';
    return;
  }
  data.forEach((row, i) => {
    const li = document.createElement("li");
    li.className = "leaderboard-item";
    const name = row.display_name || "익명";
    const accuracy = row.total_played ? Math.round((row.total_correct / row.total_played) * 100) : 0;
    const avatarHtml = row.avatar_url
      ? `<img src="${escapeHtml(row.avatar_url)}" class="leaderboard-avatar" alt="">`
      : `<span class="leaderboard-avatar"></span>`;
    li.innerHTML = `
      <span class="leaderboard-rank">${i + 1}</span>
      ${avatarHtml}
      <span class="leaderboard-name">${escapeHtml(name)}</span>
      <span class="leaderboard-score">${row.total_correct}문제 정답 · ${row.games_played}회 도전 · 정답률 ${accuracy}%</span>
    `;
    list.appendChild(li);
  });
}

document.getElementById("quiz-start-btn").addEventListener("click", startQuiz);
document.getElementById("quiz-retry-btn").addEventListener("click", startQuiz);
document.getElementById("quiz-nav-btn").addEventListener("click", renderLeaderboard);

// ---------- 초기화 ----------

renderHistory();
showScreen("input-screen");
