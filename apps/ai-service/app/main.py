from fastapi import FastAPI

app = FastAPI(title="Hush AI Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
