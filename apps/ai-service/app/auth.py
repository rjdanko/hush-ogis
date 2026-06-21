"""Operator JWT verification (SR-3 / SR-7).

The Next.js proxy is untrusted: authorization is enforced here, at the real
service boundary. Supabase access tokens are HS256 JWTs signed with the
project's JWT secret, carrying ``aud: "authenticated"`` and ``sub`` = the
user's UUID (which, for an operator, equals ``operators.id``).

Every failure path returns the SAME generic 401 -- the underlying JWT/library
error text is never echoed to the client (SR-15).
"""

import jwt
from fastapi import Header, HTTPException

from app.settings import get_settings

_UNAUTHORIZED = HTTPException(status_code=401, detail="unauthorized")


def require_operator(authorization: str = Header(default=None)) -> str:
    """Verify a Supabase operator access token and return the operator id.

    Usable as ``operator_id: str = Depends(require_operator)``.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise _UNAUTHORIZED

    token = authorization[len("Bearer ") :]

    try:
        claims = jwt.decode(
            token,
            get_settings().SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return claims["sub"]
    except (jwt.PyJWTError, KeyError):
        # Never leak the library's reason (bad signature / expired / wrong aud).
        raise _UNAUTHORIZED from None
