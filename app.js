// 태스크 1(화면 뼈대) + 태스크 2(localStorage/히스토리) + 태스크 3(Claude API 연동, 텍스트 입력만 지원).
// 근거성 검증(태스크 4)은 아직 없음: 지금은 모델 응답이 검증 없이 그대로 표시된다.

const HISTORY_KEY = "financial-assistant-history";
const API_KEY_STORAGE_KEY = "financial-assistant-api-key";
const MAX_HISTORY_ENTRIES = 30;
const MAX_STORED_INPUT_CHARS = 20000; // localStorage 용량 보호용 (원문 전체가 아니라 앞부분만 저장)

const CLAUDE_MODEL = "claude-sonnet-5";

const ANALYSIS_SYSTEM_PROMPT = `당신은 금융 지식이 부족한 비전공자를 돕는 "금융 리포트 이해 보조 어시스턴트"의 분석 엔진이다.
사용자가 제공하는 금융 리포트 원문을 읽고, 아래 JSON 형식으로만 응답하라. 다른 설명, 마크다운 코드블록,
서두/맺음말 없이 오직 JSON 객체 하나만 출력한다.

{
  "summary": "쉬운 말로 쓴 요약 (원문의 핵심 결론·수치를 빠뜨리지 않을 것)",
  "keywords": [
    { "term": "용어", "plain_explanation": "쉬운 설명", "source_quote": "원문에서 그대로 복사한 문장" }
  ],
  "insights": [
    { "insight": "원문에 근거한 시사점", "category": "opportunity|risk|neutral", "source_quote": "원문에서 그대로 복사한 문장" }
  ]
}

규칙:
- source_quote는 반드시 원문에 실제로 있는 그대로의 문장/구절이어야 한다. 지어내지 않는다.
- 투자 자문(구체적 매수/매도 추천)을 하지 않는다.
- summary는 원문의 핵심 수치(성장률, 금액, 비율, 날짜 등)를 빠뜨리지 않는다.`;

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

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

// ---------- 화면 전환 ----------

const navButtons = document.querySelectorAll(".nav-btn");
const screens = document.querySelectorAll(".screen");

function showScreen(targetId) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === targetId);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.target));
});

// ---------- API 키 입력 ----------

const apiKeyInput = document.getElementById("api-key-input");
apiKeyInput.value = getApiKey();
apiKeyInput.addEventListener("change", () => setApiKey(apiKeyInput.value.trim()));

// ---------- Claude API 호출 ----------

async function callClaudeAnalysis(sourceText, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: sourceText }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API 오류 (${response.status}): ${errBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("모델 응답에서 텍스트를 찾을 수 없습니다.");
  }

  const jsonText = textBlock.text.trim().replace(/^```json\s*|^```\s*|```$/g, "");
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("모델 응답을 JSON으로 해석하지 못했습니다: " + e.message);
  }

  if (!parsed.summary || !Array.isArray(parsed.keywords) || !Array.isArray(parsed.insights)) {
    throw new Error("모델 응답에 summary/keywords/insights가 모두 없습니다.");
  }
  return parsed;
}

// ---------- 결과 렌더링 ----------

function renderResult(result) {
  const summaryEl = document.getElementById("summary-output");
  summaryEl.textContent = result.summary;
  summaryEl.classList.remove("placeholder");

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
    li.innerHTML = `
      <span class="badge ${escapeHtml(ins.category)}">${escapeHtml(ins.category)}</span>
      ${escapeHtml(ins.insight)}
      <div class="quote">근거: ${escapeHtml(ins.source_quote)}</div>
    `;
    insightsEl.appendChild(li);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- 히스토리 렌더링 ----------

function renderHistory() {
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

// ---------- 분석 시작 ----------

const analyzeBtn = document.getElementById("analyze-btn");
const statusEl = document.getElementById("analyze-status");

analyzeBtn.addEventListener("click", async () => {
  const apiKey = getApiKey();
  const text = document.getElementById("text-input").value.trim();

  statusEl.classList.remove("error");

  if (!apiKey) {
    statusEl.textContent = "Claude API 키를 먼저 입력해주세요.";
    statusEl.classList.add("error");
    apiKeyInput.focus();
    return;
  }
  if (!text) {
    statusEl.textContent = "분석할 텍스트를 붙여넣어주세요. (PDF 업로드는 아직 미지원)";
    statusEl.classList.add("error");
    return;
  }

  analyzeBtn.disabled = true;
  statusEl.textContent = "분석 중입니다... (문서 길이에 따라 수십 초 걸릴 수 있습니다)";

  const startedAt = Date.now();
  try {
    const result = await callClaudeAnalysis(text, apiKey);
    const durationMs = Date.now() - startedAt;

    renderResult(result);

    addHistoryEntry({
      id: startedAt,
      createdAt: new Date(startedAt).toLocaleString("ko-KR"),
      sourceName: "직접 입력",
      inputText: text.slice(0, MAX_STORED_INPUT_CHARS),
      result,
      durationMs,
    });
    renderHistory();

    statusEl.textContent = `분석 완료 (${(durationMs / 1000).toFixed(1)}초)`;
    showScreen("result-screen");
  } catch (e) {
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
