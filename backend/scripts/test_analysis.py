"""analysis_service를 BOK 리포트의 앞부분 일부(약 5~10페이지 분량)로 검증.

전체 150페이지 문서를 그대로 넣으면 토큰/비용/응답시간이 MVP 검증 범위를 넘어서므로,
지금은 기능(요약/키워드/인사이트/근거성 검증)이 정상 동작하는지만 앞부분 발췌로 확인한다.
전체 문서 지원(청킹 등)은 이후 과제로 남긴다.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from app.services.ingestion_service import extract_text_from_pdf
from app.services.analysis_service import analyze_document

SAMPLE_PDF = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "한국은행_경제전망보고서_2026년5월.pdf",
)

with open(SAMPLE_PDF, "rb") as f:
    full_text = extract_text_from_pdf(f.read())

excerpt = full_text[:9000]
print(f"전체 길이: {len(full_text)}자 / 테스트에 사용하는 발췌 길이: {len(excerpt)}자\n")

start = time.time()
result, dropped = analyze_document(excerpt)
elapsed = time.time() - start

print(f"소요 시간: {elapsed:.1f}초\n")
print("=== summary ===")
print(result.summary)

print("\n=== keywords ===")
for kw in result.keywords:
    print(f"- {kw.term}: {kw.plain_explanation}")
    print(f"  (근거: {kw.source_quote[:60]}...)")

print("\n=== insights ===")
for ins in result.insights:
    print(f"- [{ins.category}] {ins.insight}")
    print(f"  (근거: {ins.source_quote[:60]}...)")

print(f"\n=== 근거성 검증에서 제거된 항목: {len(dropped)}건 ===")
for d in dropped:
    print(f"- {d}")
