"""Groq-backed weekly digest generation (B5).

Turns the anonymized aggregated metrics dict (from the ``zone_weekly_metrics``
RPC, fetched via ``app.supabase_client.fetch_zone_weekly_metrics``) into a calm,
plain-English weekly digest for a venue operator, using Groq's free-tier
**strict JSON-schema** structured output so the dashboard can render it
reliably.

Privacy by construction (PRD 7.3): the prompt is built from an explicit
allow-list of aggregated keys. There are no per-user identifiers in the metrics
dict, and the renderer can never forward an unexpected field (e.g. a raw row
someone stuffs in later) into the prompt.

Structured-output binding (verified against Groq docs, 2026-07-16): the
``groq`` SDK has no Pydantic ``.parse()`` helper, so the raw JSON schema is
passed via ``response_format={"type": "json_schema", "json_schema": {...,
"strict": True, "schema": DigestResponse.model_json_schema()}}``, and the
response text is manually decoded with ``json.loads`` + ``model_validate``.
Strict mode requires ``additionalProperties: false`` on every object, which
``DigestResponse``/``Suggestion`` provide via ``ConfigDict(extra="forbid")``
(see app.models). ``openai/gpt-oss-120b`` and ``openai/gpt-oss-20b`` are
currently the only Groq models supporting strict mode.
"""

import json
from functools import lru_cache

from groq import Groq

from app.models import DigestResponse
from app.settings import get_settings


SYSTEM_PROMPT = (
    "You write a brief, factual, encouraging weekly digest for a venue operator "
    "about their quiet zone -- a place set aside for intentional digital silence. "
    "Write in a calm, plain voice. This is the anti-social-media product: there is "
    "NO hype, NO growth-hacking language, NO exclamation-point spam, and NO "
    "manipulative engagement framing. Do not invent urgency.\n\n"
    "Return a short `summary` paragraph (a few calm sentences on how the week went), "
    "then 2 to 4 concrete, gentle `suggestions`. Each suggestion is a short title plus "
    "a sentence or two. Ground every observation ONLY in the numbers provided -- do not "
    "speculate beyond them. If activity was low, say so plainly and supportively rather "
    "than inventing urgency or pressure to grow."
)

# Allow-list of aggregated, anonymized keys we will render. Nothing outside this
# set can reach the prompt -- the guard that keeps raw rows / identifiers out.
_AGGREGATED_KEYS = (
    "zone_name",
    "window_days",
    "quiet_index_trend",
    "check_in_count",
    "total_quiet_minutes",
    "total_points_accrued",
    "redemption_count",
    "peak_window",
)


@lru_cache
def _client() -> Groq:
    """Return a cached Groq client (constructed lazily, not at import time)."""
    return Groq(api_key=get_settings().GROQ_API_KEY)


def build_user_content(metrics: dict) -> str:
    """Render the aggregated metrics as readable JSON for the user message.

    Only the known aggregated keys are included; any other field in ``metrics``
    (e.g. an accidentally-included raw row) is dropped before rendering.
    """
    safe = {key: metrics[key] for key in _AGGREGATED_KEYS if key in metrics}
    return (
        "Here are this zone's anonymized aggregated metrics for the past week. "
        "Write the digest grounded only in these numbers:\n\n"
        + json.dumps(safe, indent=2, sort_keys=True)
    )


def build_messages(metrics: dict) -> list[dict]:
    """Build the user-turn messages array (Groq has no top-level system param)."""
    return [{"role": "user", "content": build_user_content(metrics)}]


def generate_digest(metrics: dict) -> DigestResponse:
    """Generate a calm weekly digest from the aggregated metrics dict.

    Only the aggregated metrics dict goes in -- never any user identifier.
    """
    settings = get_settings()
    result = _client().chat.completions.create(
        model=settings.DIGEST_MODEL,
        max_tokens=2048,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, *build_messages(metrics)],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "digest_response",
                "strict": True,
                "schema": DigestResponse.model_json_schema(),
            },
        },
    )
    content = result.choices[0].message.content
    return DigestResponse.model_validate(json.loads(content))
