"""ingestion_service를 실제 샘플 PDF(한국은행 경제전망보고서)로 검증."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.ingestion_service import extract_text_from_pdf

SAMPLE_PDF = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "한국은행_경제전망보고서_2026년5월.pdf",
)

with open(SAMPLE_PDF, "rb") as f:
    pdf_bytes = f.read()

text = extract_text_from_pdf(pdf_bytes)

print("extracted length:", len(text))
print("--- first 500 chars ---")
print(text[:500])
print("--- last 300 chars ---")
print(text[-300:])
