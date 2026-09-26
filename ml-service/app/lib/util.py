"""
Small cross-cutting helpers needed to port JS-authored arithmetic exactly.

Python's built-in round() uses round-half-to-even ("banker's rounding"), so
round(2.5) == 2 — but every formula this service ports was written against
JS's Math.round, which rounds half away from zero (Math.round(2.5) === 3).
Using Python's round() directly would silently change scores on exact .5
boundaries, so every port of a `Math.round(...)` call goes through js_round
instead.
"""

import math
from datetime import datetime, timezone


def js_round(value: float) -> float:
    return math.floor(value + 0.5) if value >= 0 else math.ceil(value - 0.5)


def round_to(value: float, decimals: int) -> float:
    factor = 10**decimals
    return js_round(value * factor) / factor


def clamp(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, value))


def js_num(value: float) -> str:
    """Formats a number the way JS does when interpolated into a template
    string (String(300) === "300", String(300.5) === "300.5") — Python's
    f-string would render the first as "300.0" if the value happens to be a
    float, so any spot porting a bare `${n}` interpolation goes through this
    instead of relying on the value's Python type."""
    return str(int(value)) if value == int(value) else str(value)


def parse_dt(date_str: str) -> datetime:
    """Parses a bare date ("2023-01-01") or an ISO timestamp (with or
    without a trailing "Z") into a timezone-aware UTC datetime, mirroring
    what `new Date(dateStr)` accepts in the original TypeScript."""
    s = date_str.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
