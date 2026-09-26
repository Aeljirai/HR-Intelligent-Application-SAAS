"""Ported 1:1 from ml/headcountForecast.ts."""

import calendar
import math
from datetime import datetime, timezone
from typing import Any, Optional

from app.lib.stats import linear_regression, linear_regression_line
from app.lib.util import js_round, parse_dt


def _month_key(d: datetime) -> str:
    return f"{d.year}-{d.month:02d}"


def _add_months(d: datetime, n: int) -> datetime:
    total = d.year * 12 + (d.month - 1) + n
    year, month = divmod(total, 12)
    return datetime(year, month + 1, 1, tzinfo=timezone.utc)


def _headcount_at_month_end(employees: list[dict[str, Any]], month_key_str: str) -> int:
    y, m = (int(p) for p in month_key_str.split("-"))
    last_day = calendar.monthrange(y, m)[1]
    cutoff = datetime(y, m, last_day, 23, 59, 59, tzinfo=timezone.utc)

    count = 0
    for e in employees:
        hired = parse_dt(e["hire_date"]) <= cutoff
        still_employed = not e.get("termination_date") or parse_dt(e["termination_date"]) > cutoff
        if hired and still_employed:
            count += 1
    return count


def forecast_headcount(employees: list[dict[str, Any]], months_ahead: Optional[int] = None) -> list[dict[str, Any]]:
    """
    Reconstructs historical month-end headcount from hire/termination dates,
    fits a linear trend, then projects `months_ahead` forward with a
    widening confidence band driven by the observed month-over-month
    volatility (a stand-in for a proper time-series model's prediction
    interval).
    """
    months_ahead = months_ahead if months_ahead is not None else 6
    now = datetime.now(timezone.utc)
    history_months = 12
    months = [_month_key(_add_months(now, -i)) for i in range(history_months - 1, -1, -1)]

    actuals = [_headcount_at_month_end(employees, m) for m in months]
    points = [{"month": m, "actual": actuals[i], "forecast": None, "lower": None, "upper": None} for i, m in enumerate(months)]

    xy = [(float(i), float(v)) for i, v in enumerate(actuals)]
    slope, intercept = linear_regression(xy)
    predict = linear_regression_line(slope, intercept)

    deltas = [actuals[i + 1] - actuals[i] for i in range(len(actuals) - 1)]
    volatility = math.sqrt(sum(d * d for d in deltas) / len(deltas)) if deltas else 1

    last_index = len(months) - 1
    for i in range(1, months_ahead + 1):
        idx = last_index + i
        month_label = _month_key(_add_months(now, i))
        point = max(0, int(js_round(predict(idx))))
        band = max(1, int(js_round(volatility * math.sqrt(i) * 1.6)))
        points.append(
            {
                "month": month_label,
                "actual": None,
                "forecast": point,
                "lower": max(0, point - band),
                "upper": point + band,
            }
        )

    return points
