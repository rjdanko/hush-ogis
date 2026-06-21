from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.errors import install_error_handlers


def _build_app() -> FastAPI:
    app = FastAPI()

    @app.get("/boom")
    def boom():
        raise RuntimeError("secret leaked: sk-123")

    @app.get("/forbidden")
    def forbidden():
        raise HTTPException(status_code=403, detail="nope")

    install_error_handlers(app)
    return app


def test_unhandled_exception_returns_generic_500():
    client = TestClient(_build_app(), raise_server_exceptions=False)
    resp = client.get("/boom")
    assert resp.status_code == 500
    assert resp.json() == {"error": "internal_error"}
    assert "secret leaked" not in resp.text
    assert "sk-123" not in resp.text
    assert "RuntimeError" not in resp.text


def test_http_exception_passes_through():
    client = TestClient(_build_app(), raise_server_exceptions=False)
    resp = client.get("/forbidden")
    assert resp.status_code == 403
    assert resp.json() == {"detail": "nope"}
