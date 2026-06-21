"""Response DTOs for the operator weekly digest (B5).

These are the structured-output contract Claude is bound to: a short ``summary``
paragraph plus 2-4 gentle ``suggestions``. No length/count constraints are
declared -- the structured-output JSON-Schema subset does not support
``min_length`` / ``max_items``, so the calm "2-4 suggestions" shape is steered
by the prompt, not the schema.
"""

from pydantic import BaseModel


class Suggestion(BaseModel):
    title: str
    body: str


class DigestResponse(BaseModel):
    summary: str
    suggestions: list[Suggestion]
