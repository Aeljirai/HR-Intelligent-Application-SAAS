"""Ported 1:1 from ml/shiftOptimizer.ts."""

from typing import Any, Optional

from app.lib.util import js_round

CANDIDATE_WINDOWS = [
    {"name": "Early", "start": "07:00", "end": "15:00", "startHour": 7},
    {"name": "Standard", "start": "09:00", "end": "17:00", "startHour": 9},
    {"name": "Late", "start": "11:00", "end": "19:00", "startHour": 11},
]


def optimize_shifts(
    attendance: list[dict[str, Any]], employees: list[dict[str, Any]], department_id: Optional[str]
) -> dict[str, Any]:
    """
    Buckets historical check-in times into an hourly histogram to find the
    true peak arrival hour, then sizes three candidate shift windows so
    total scheduled coverage tracks observed demand instead of a flat
    headcount.
    """
    if department_id:
        emp_by_id = {e["id"]: e for e in employees}
        scoped = [a for a in attendance if (emp_by_id.get(a["employee_id"]) or {}).get("department_id") == department_id]
    else:
        scoped = attendance

    with_check_in = [a for a in scoped if a.get("check_in") and a["status"] in ("present", "late")]
    hour_counts = [0] * 24
    for record in with_check_in:
        try:
            hour = int(record["check_in"].split(":")[0])
        except (ValueError, IndexError):
            continue
        hour_counts[hour] += 1
    peak_hour = hour_counts.index(max(hour_counts))

    distinct_days = len({a["date"] for a in scoped}) or 1
    headcount = (
        len([e for e in employees if e["department_id"] == department_id]) if department_id else len(employees)
    )

    windows = []
    for w in CANDIDATE_WINDOWS:
        in_window = [
            a for a in with_check_in if w["startHour"] <= int(a["check_in"].split(":")[0]) < w["startHour"] + 2
        ]
        avg_headcount = len(in_window) / distinct_days
        is_peak = abs(w["startHour"] - peak_hour) <= 1
        recommended = max(1, int(js_round(avg_headcount * 1.15 if is_peak else avg_headcount * 0.9)))

        windows.append(
            {
                "name": w["name"],
                "start": w["start"],
                "end": w["end"],
                "recommended_headcount": min(recommended, headcount),
                "current_avg_headcount": js_round(avg_headcount * 10) / 10,
                "is_peak": is_peak,
            }
        )

    return {"department_id": department_id, "windows": windows, "peak_hour": peak_hour}
