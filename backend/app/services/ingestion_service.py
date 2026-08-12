"""업로드된 파일/텍스트에서 분석에 쓸 원문 텍스트를 추출한다."""
import io

import pdfplumber


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """PDF 바이트에서 페이지별 텍스트를 추출해 하나의 문자열로 합친다."""
    pages = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages.append(text)
    return "\n\n".join(pages).strip()


def normalize_pasted_text(text: str) -> str:
    """붙여넣은 텍스트는 앞뒤 공백만 정리해서 그대로 사용한다."""
    return text.strip()
