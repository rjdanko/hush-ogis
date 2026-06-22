from fastapi import FastAPI

from app.errors import install_error_handlers
from app.routes_badge import router as badge_router
from app.routes_digest import router as digest_router

app = FastAPI(title="Hush AI Service")

app.include_router(digest_router)
app.include_router(badge_router)
install_error_handlers(app)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
