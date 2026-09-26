"""Ported 1:1 from ml/compensationSandbox.ts."""

from typing import Any

from app.lib.util import js_round


def simulate_compensation_change(
    employees: list[dict[str, Any]], departments: list[dict[str, Any]], adjustment_pct: float
) -> dict[str, Any]:
    """
    Applies a uniform percentage adjustment (-10%..+15% in the UI) to every
    active employee's salary and rolls the impact up by department, so HR
    can see the payroll consequence of an across-the-board raise/freeze
    before committing to it.
    """
    active = [e for e in employees if e["status"] == "active"]
    dept_name = {d["id"]: d["name"] for d in departments}

    by_employee = [
        {
            "employee_id": e["id"],
            "full_name": e["full_name"],
            "current": e["salary"],
            "adjusted": js_round(e["salary"] * (1 + adjustment_pct / 100)),
        }
        for e in active
    ]

    by_dept_map: dict[str, dict[str, Any]] = {}
    for e in active:
        key = e["department_id"] or "unassigned"
        existing = by_dept_map.get(
            key,
            {
                "department_id": key,
                "department_name": dept_name.get(key, "Unassigned"),
                "headcount": 0,
                "current_payroll": 0,
                "adjusted_payroll": 0,
                "delta": 0,
            },
        )
        existing["headcount"] += 1
        existing["current_payroll"] += e["salary"]
        existing["adjusted_payroll"] += js_round(e["salary"] * (1 + adjustment_pct / 100))
        existing["delta"] = existing["adjusted_payroll"] - existing["current_payroll"]
        by_dept_map[key] = existing

    by_department = sorted(by_dept_map.values(), key=lambda d: d["current_payroll"], reverse=True)
    total_current = sum(d["current_payroll"] for d in by_department)
    total_adjusted = sum(d["adjusted_payroll"] for d in by_department)

    return {
        "adjustment_pct": adjustment_pct,
        "total_current": total_current,
        "total_adjusted": total_adjusted,
        "total_delta": total_adjusted - total_current,
        "by_department": by_department,
        "by_employee": by_employee,
    }
