from fastapi import FastAPI

app = FastAPI(title="금융 리포트 이해 보조 어시스턴트 API")


@app.get("/health")
def health():
    return {"status": "ok"}
