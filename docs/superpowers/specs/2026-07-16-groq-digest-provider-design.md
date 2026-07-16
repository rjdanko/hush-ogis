# Design: Free open-source model provider for the operator digest

## Context

`apps/ai-service/app/digest.py` (`generate_digest`, B5) is the only LLM call
site in the codebase — it turns a zone's anonymized weekly metrics into a
calm `DigestResponse` (`summary` + 2-4 `suggestions`) for the operator
dashboard, using the Anthropic SDK's structured-output surface
(`client.messages.parse(..., output_format=DigestResponse)`).

The user wants this call moved off the paid Claude API onto a **free,
hosted** (not self-hosted — their laptop can't run local inference)
open-source model provider.

`routes_analytics.py` and `models.py` only reference Claude in docstrings;
no other AI call sites exist. CLAUDE.md's "opus demo showcase" model split is
aspirational and was never built.

## Decisions

- **Scope:** only the digest feature. No general AI-provider abstraction —
  YAGNI, since there's one call site.
- **Provider:** [Groq](https://console.groq.com), free tier, OpenAI-compatible
  chat-completions API.
- **Model:** `openai/gpt-oss-120b` — OpenAI's open-weight (Apache-2.0) model,
  hosted free by Groq. Verified (2026-07-16, Groq docs) that this is one of
  only two models supporting `strict: true` JSON-schema structured outputs on
  Groq (the other is `gpt-oss-20b`); Llama 3.3 70B only gets best-effort JSON
  there. Strict mode is the closest match to Anthropic's current
  parse-with-guaranteed-schema behavior.
- **Failure handling:** no fallback. If Groq errors or returns invalid JSON,
  the exception propagates — this already matches `routes_digest.py`'s
  existing behavior ("Any failure here propagates to the global handler ->
  generic 500"), so no route-level change is needed.
- **Docs:** update CLAUDE.md's "Planned architecture" AI bullet to describe
  Groq instead of Claude, and drop the haiku/opus split.

## Call-flow changes (`digest.py`)

Groq/OpenAI-style chat-completions has no top-level `system` parameter —
`SYSTEM_PROMPT` moves into the `messages` list as a `{"role": "system", ...}`
entry (in addition to the existing user turn from `build_messages`).

Structured output is requested via:

```python
response_format={
    "type": "json_schema",
    "json_schema": {
        "name": "digest_response",
        "strict": True,
        "schema": DigestResponse.model_json_schema(),
    },
}
```

The response arrives as `choices[0].message.content` (a JSON string, not a
pre-parsed object like Anthropic's `parsed_output`), so `generate_digest()`
always does `json.loads(...)` then `DigestResponse.model_validate(...)` —
effectively always taking the path the current dict-coercion branch only
takes sometimes.

`build_user_content`, the aggregated-keys privacy allow-list, and
`SYSTEM_PROMPT`'s content are unchanged — only the transport/client layer
changes.

## Config & dependencies

- `apps/ai-service/pyproject.toml`: remove `anthropic`, add `groq`.
- `apps/ai-service/app/settings.py`: rename `ANTHROPIC_API_KEY` ->
  `GROQ_API_KEY`; `DIGEST_MODEL` default becomes `"openai/gpt-oss-120b"`.
- Root `.env.example` and `.env`: same rename (`ANTHROPIC_API_KEY` ->
  `GROQ_API_KEY`, `DIGEST_MODEL` default updated).

## Testing

- `apps/ai-service/tests/test_digest.py`: the four Anthropic-mocking tests
  (`test_generate_digest_maps_structured_response`,
  `test_generate_digest_coerces_dict_parsed_output`,
  `test_client_built_lazily`, and the captured-kwargs assertions in the
  first of those) get rewritten to mock the Groq client's
  `chat.completions.create` and assert the `response_format`/model id passed
  through, and to build a fake `choices[0].message.content` JSON string
  instead of a `parsed_output` object. The privacy/prompt-content tests
  (`build_user_content`, `build_messages`, no-user-identifiers, calm-prompt
  assertions) are unaffected.
- `apps/ai-service/tests/test_digest_endpoint.py`: check for any
  Anthropic-specific mocking and update to match if present.

## Docs

- `CLAUDE.md` "Planned architecture" section: replace "FastAPI service calls
  the Claude API (`claude-haiku-4-5` for routine digests, `claude-opus-4-8`
  for the demo showcase). The Claude key lives only in the service env." with
  a description of Groq + `GROQ_API_KEY`, and drop the haiku/opus split
  since only one model/tier is used and the opus demo path doesn't exist.

## Out of scope

- No general-purpose AI-provider abstraction layer.
- No self-hosted inference.
- No Claude fallback path.
