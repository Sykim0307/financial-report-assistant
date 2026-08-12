"""분석 결과 구조 — summary/keywords/insights, 각 항목에 근거 인용문(source_quote) 포함."""
from typing import Literal

from pydantic import BaseModel, Field


class KeywordExplanation(BaseModel):
    term: str = Field(description="원문에 등장한 금융 전문용어")
    plain_explanation: str = Field(description="비전공자도 이해할 수 있는 쉬운 설명")
    source_quote: str = Field(description="이 용어가 등장하는 원문의 정확한(그대로 복사한) 인용문")


class Insight(BaseModel):
    insight: str = Field(description="원문에 근거한 시사점 한 문장")
    category: Literal["opportunity", "risk", "neutral"]
    source_quote: str = Field(description="이 인사이트의 근거가 되는 원문의 정확한(그대로 복사한) 인용문")


class AnalysisResult(BaseModel):
    summary: str = Field(description="원문의 핵심 결론·수치를 빠뜨리지 않는 쉬운 말 요약")
    keywords: list[KeywordExplanation]
    insights: list[Insight]
