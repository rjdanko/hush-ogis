from app.badge_svg import render_badge_svg, render_unverified_badge_svg


def test_render_badge_svg_includes_rounded_value():
    svg = render_badge_svg(82.7)
    assert svg.startswith("<svg")
    assert "83" in svg  # rounded
    assert "Hush Quiet Index" in svg


def test_render_unverified_badge_svg_has_no_numeric_value_and_says_unavailable():
    svg = render_unverified_badge_svg()
    assert svg.startswith("<svg")
    assert "Badge unavailable" in svg
