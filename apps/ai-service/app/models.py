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


class BadgeTokenResponse(BaseModel):
    token: str
    expires_in: int


class QuietIndexTrendPoint(BaseModel):
    day: str
    avg_value: float
    avg_active_count: float


class PeakWindow(BaseModel):
    hour_of_day: int | None = None
    max_active_count: int | None = None


class ZoneAnalyticsResponse(BaseModel):
    zone_name: str
    window_days: int
    quiet_index_trend: list[QuietIndexTrendPoint]
    check_in_count: int
    total_quiet_minutes: float
    total_points_accrued: int
    redemption_count: int
    peak_window: PeakWindow
