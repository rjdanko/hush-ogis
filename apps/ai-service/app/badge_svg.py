"""Minimal SVG renderer for the embeddable certification badge (O4).

Calm, single-color, no animation -- this renders server-side as a static
image, so any motion language from the Design Brief doesn't apply here.
"""

_WIDTH = 220
_HEIGHT = 60


def render_badge_svg(avg_value: float) -> str:
    """Render the verified badge SVG showing the average Quiet Index."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_WIDTH}" height="{_HEIGHT}" '
        f'role="img" aria-label="Hush Quiet Index">'
        f'<rect width="{_WIDTH}" height="{_HEIGHT}" rx="8" fill="#1c1c1e"/>'
        f'<text x="16" y="24" fill="#9a9a9a" font-family="sans-serif" font-size="11">'
        f"Hush Quiet Index</text>"
        f'<text x="16" y="46" fill="#e8e8e8" font-family="sans-serif" font-size="22">'
        f"{round(avg_value)}</text>"
        f"</svg>"
    )


def render_unverified_badge_svg() -> str:
    """Render the fallback SVG shown when a badge token fails verification."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_WIDTH}" height="{_HEIGHT}" '
        f'role="img" aria-label="Hush badge unavailable">'
        f'<rect width="{_WIDTH}" height="{_HEIGHT}" rx="8" fill="#1c1c1e"/>'
        f'<text x="16" y="34" fill="#9a9a9a" font-family="sans-serif" font-size="13">'
        f"Badge unavailable</text>"
        f"</svg>"
    )
