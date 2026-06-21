"""Error hygiene (SR-15).

Turn any unhandled exception into a generic ``500 {"error":"internal_error"}``
with no stack trace or secret in the body. The real error is logged
server-side so it stays debuggable. FastAPI already renders ``HTTPException``
cleanly, so only a catch-all for unhandled ``Exception`` is registered.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("hush.ai_service")


def install_error_handlers(app: FastAPI) -> None:
    """Register a catch-all handler that returns a generic 500 body."""

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"error": "internal_error"})
