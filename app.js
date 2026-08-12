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

async function saveAnalysisToDb({ sourceName, sourceType, inputText, truncated, result, model, durationMs }) {
  try {
    const { data: analysisRow, error: analysisError } = await supabaseClient
      .from("analyses")
      .insert({
        source_name: sourceName,
        source_type: sourceType,
        input_text: inputText,
        input_char_count: inputText.length,
        truncated,
        summary: result.summary_points.join("\n"),
        model,
        duration_ms: durationMs,
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
  } catch (e) {
    console.error("Supabase 저장 실패 (localStorage 히스토리는 정상 저장됨):", e);
  }
}

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

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(" "));
  }
  return { text: pageTexts.join("\n\n").trim(), numPages: pdf.numPages };
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

// ---------- Claude 분석 (Supabase Edge Function 경유) ----------
// Anthropic API 키는 브라우저에 두지 않는다. Edge Function(analyze-report)이
// 서버 측 시크릿(ANTHROPIC_API_KEY)으로 Claude를 호출하고 결과만 돌려준다.

async function callClaudeAnalysis(sourceText) {
  const { data, error } = await supabaseClient.functions.invoke("analyze-report", {
    body: { text: sourceText },
  });

  if (error) {
    throw new Error("분석 요청 실패: " + error.message);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  if (!Array.isArray(data?.summary_points) || data.summary_points.length === 0 || !Array.isArray(data.keywords) || !Array.isArray(data.insights)) {
    throw new Error("모델 응답에 summary_points/keywords/insights가 모두 없습니다.");
  }
  return data;
}

// ---------- 결과 렌더링 ----------

function renderResult(result) {
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
    insightsEl.appendChild(li);
  });
}

const CATEGORY_LABELS = {
  opportunity: "기회",
  risk: "리스크",
  neutral: "참고",
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- 좌우 히스토리 바로가기 카드 ----------

document.querySelectorAll(".history-peek-card").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.target));
});

function renderHistoryPeekCards() {
  const list = loadHistory();
  const dynamicDescEls = document.querySelectorAll(".history-peek-desc[data-dynamic]");
  const text = list.length
    ? `최근 분석: ${list[0].sourceName} · ${list[0].createdAt}`
    : "분석이 끝나면 이 카드에서 최근 결과를 바로 확인할 수 있어요.";
  dynamicDescEls.forEach((el) => {
    el.textContent = text;
  });
}

// ---------- 히스토리 렌더링 ----------

function renderHistory() {
  renderHistoryPeekCards();
  const list = loadHistory();
  const historyList = document.getElementById("history-list");
  historyList.classList.remove("placeholder");
  historyList.innerHTML = "";

  if (list.length === 0) {
    historyList.classList.add("placeholder");
    historyList.innerHTML = "<li>저장된 분석 기록이 없습니다.</li>";
    return;
  }

  list.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.createdAt} · ${entry.sourceName} (${entry.durationMs}ms)`;
    li.addEventListener("click", () => {
      renderResult(entry.result);
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

  const startedAt = Date.now();
  try {
    const result = await callClaudeAnalysis(text);
    const durationMs = Date.now() - startedAt;
    await progress.finish();

    renderResult(result);

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

    await saveAnalysisToDb({
      sourceName,
      sourceType,
      inputText: text,
      truncated: Boolean(truncatedNote),
      result,
      model: result.model,
      durationMs,
    });

    statusEl.textContent = `분석 완료 (${(durationMs / 1000).toFixed(1)}초)${truncatedNote}`;
    showScreen("result-screen");
  } catch (e) {
    progress.stop();
    console.error(e);
    statusEl.textContent = "분석 실패: " + e.message;
    statusEl.classList.add("error");
  } finally {
    analyzeBtn.disabled = false;
  }
});

// ---------- 초기화 ----------

renderHistory();
showScreen("input-screen");
