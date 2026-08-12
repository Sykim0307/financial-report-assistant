"""Claude API로 리포트를 분석하고, 근거성(groundedness)을 프로그램적으로 검증한다."""
import re

import anthropic

from app.core.prompts import ANALYSIS_SYSTEM_PROMPT
from app.schemas.analysis_schema import AnalysisResult

_client = anthropic.Anthropic()


def _normalize(text: str) -> str:
    """공백/줄바꿈 차이를 무시하고 비교할 수 있도록 정규화."""
    return re.sub(r"\s+", "", text)


def _is_grounded(quote: str, source_text: str) -> bool:
    if not quote:
        return False
    return _normalize(quote) in _normalize(source_text)


def _filter_ungrounded(result: AnalysisResult, source_text: str) -> tuple[AnalysisResult, list[str]]:
    """source_quote가 원문에 실제로 있는지 검증하고, 통과 못한 항목은 제거한다."""
    dropped: list[str] = []

    kept_keywords = []
    for kw in result.keywords:
        if _is_grounded(kw.source_quote, source_text):
            kept_keywords.append(kw)
        else:
            dropped.append(f"keyword '{kw.term}' (근거 불일치로 제거)")

    kept_insights = []
    for insight in result.insights:
        if _is_grounded(insight.source_quote, source_text):
            kept_insights.append(insight)
        else:
            dropped.append(f"insight '{insight.insight[:30]}...' (근거 불일치로 제거)")

    return (
        AnalysisResult(summary=result.summary, keywords=kept_keywords, insights=kept_insights),
        dropped,
    )


def analyze_document(source_text: str, effort: str = "medium") -> tuple[AnalysisResult, list[str]]:
    """원문 텍스트를 분석해 (검증된 AnalysisResult, 제거된 항목 로그)를 반환한다."""
    response = _client.messages.parse(
        model="claude-sonnet-5",
        max_tokens=16000,
        system=[
            {
                "type": "text",
                "text": ANALYSIS_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": source_text}],
        output_format=AnalysisResult,
        output_config={"effort": effort},
    )

    if response.stop_reason == "max_tokens":
        raise RuntimeError("분석 응답이 max_tokens로 잘렸습니다. max_tokens를 늘리거나 effort를 낮추세요.")
    if response.stop_reason == "refusal":
        raise RuntimeError("모델이 분석 요청을 거부했습니다.")

    result = response.parsed_output
    verified_result, dropped = _filter_ungrounded(result, source_text)
    return verified_result, dropped
