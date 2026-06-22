"""Operator JWT verification (SR-3 / SR-7).

The Next.js proxy is untrusted: authorization is enforced here, at the real
service boundary. Supabase issues two different token shapes depending on
project configuration:
  * HS256 -- legacy/local projects, signed with the shared SUPABASE_JWT_SECRET.
  * ES256 -- asymmetric, JWKS-published; this is what the real Supabase auth
    stack issues for operator logins in this project.
Both carry ``aud: "authenticated"`` and ``sub`` = the user's UUID (which, for
an operator, equals ``operators.id``).

The token's own ``alg`` header is read ONLY to pick which verification path
to take -- it never selects the secret/key, so a token cannot downgrade
itself from ES256 to a forged HS256 signed with, say, the public key
(the classic alg-confusion attack). Each path verifies against exactly one
algorithm and one trust source.

Every failure path returns the SAME generic 401 -- the underlying JWT/library
error text is never echoed to the client (SR-15).
"""

import jwt
from fastapi import Header, HTTPException

from app.settings import get_settings

_UNAUTHORIZED = HTTPException(status_code=401, detail="unauthorized")

_jwks_client: "jwt.PyJWKClient | None" = None


def _get_jwks_client() -> "jwt.PyJWKClient":
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{get_settings().SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = jwt.PyJWKClient(jwks_url)
    return _jwks_client


def require_operator(authorization: str = Header(default=None)) -> str:
    """Verify a Supabase operator access token and return the operator id.

    Usable as ``operator_id: str = Depends(require_operator)``.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise _UNAUTHORIZED

    token = authorization[len("Bearer ") :]

    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise _UNAUTHORIZED from None

    alg = header.get("alg")

    try:
        if alg == "ES256":
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        elif alg == "HS256":
            claims = jwt.decode(
                token,
                get_settings().SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
            raise _UNAUTHORIZED
        return claims["sub"]
    except (jwt.PyJWTError, KeyError):
        # Never leak the library's reason (bad signature / expired / wrong aud).
        raise _UNAUTHORIZED from None
