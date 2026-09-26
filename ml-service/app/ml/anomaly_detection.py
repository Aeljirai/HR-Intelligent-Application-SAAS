"""Ported 1:1 from ml/anomalyDetection.ts."""

from collections import defaultdict
from typing import Any

from app.lib.util import js_round
from app.lib.stats import mean, standard_deviation

THRESHOLD_RATE = 0.15  # flat 15% threshold requested by product
WINDOW_DAYS = 7


def _round(n: float) -> float:
    return js_round(n * 1000) / 1000


def _group_by_date(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        grouped[r["date"]].append(r)
    return grouped


def _rate_for_date(records: list[dict[str, Any]], metric: str) -> float:
    if not records:
        return 0
    hits = sum(1 for r in records if (r["status"] == "absent" if metric == "absenteeism" else r["status"] == "late"))
    return hits / len(records)


def detect_attendance_anomalies(
    attendance: list[dict[str, Any]], employees: list[dict[str, Any]], departments: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Client/server-shared "ML" simulation: a rolling-window rate compared
    against (a) a flat 15% threshold and (b) the department's own historical
    z-score, so a department that is *normally* a bit noisy doesn't trigger
    false alarms while a real spike still does.
    """
    dept_by_employee = {e["id"]: e["department_id"] for e in employees}
    anomalies: list[dict[str, Any]] = []

    for dept in departments:
        dept_employee_ids = {e["id"] for e in employees if e["department_id"] == dept["id"]}
        if not dept_employee_ids:
            continue

        dept_attendance = [a for a in attendance if dept_by_employee.get(a["employee_id"]) == dept["id"]]
        by_date = _group_by_date(dept_attendance)
        dates = sorted(by_date.keys())
        if len(dates) < WINDOW_DAYS:
            continue

        for metric in ("absenteeism", "late_arrivals"):
            daily_rates = [_rate_for_date(by_date.get(d, []), metric) for d in dates]
            rolling_rates = []
            for i in range(WINDOW_DAYS - 1, len(daily_rates)):
                window_slice = daily_rates[i - WINDOW_DAYS + 1 : i + 1]
                rolling_rates.append(mean(window_slice))
            if not rolling_rates:
                continue

            baseline = mean(rolling_rates)
            sd = standard_deviation(rolling_rates) if len(rolling_rates) > 1 else 0
            latest_rate = rolling_rates[-1] if rolling_rates else 0
            z_score = (latest_rate - baseline) / sd if sd > 0 else 0

            if latest_rate >= THRESHOLD_RATE and (z_score >= 1.5 or latest_rate >= THRESHOLD_RATE * 1.5):
                severity = (
                    "critical"
                    if latest_rate >= THRESHOLD_RATE * 2 or z_score >= 3
                    else "warning"
                    if latest_rate >= THRESHOLD_RATE * 1.5 or z_score >= 2
                    else "watch"
                )

                anomalies.append(
                    {
                        "department_id": dept["id"],
                        "department_name": dept["name"],
                        "window_start": dates[len(dates) - WINDOW_DAYS] if len(dates) >= WINDOW_DAYS else dates[0],
                        "window_end": dates[-1],
                        "metric": metric,
                        "rate": _round(latest_rate),
                        "baseline_rate": _round(baseline),
                        "z_score": _round(z_score),
                        "severity": severity,
                    }
                )

    return sorted(anomalies, key=lambda a: a["rate"], reverse=True)
