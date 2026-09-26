"""Ported 1:1 from ml/resourceReallocation.ts."""

from typing import Any

from app.lib.stats import mean
from app.lib.util import js_round


def compute_department_loads(
    departments: list[dict[str, Any]], employees: list[dict[str, Any]], tickets: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    active_employees = [e for e in employees if e["status"] == "active"]
    open_tickets = [t for t in tickets if t["status"] in ("open", "in_progress", "escalated")]
    emp_dept = {e["id"]: e["department_id"] for e in active_employees}

    loads = []
    for dept in departments:
        headcount = len([e for e in active_employees if e["department_id"] == dept["id"]])
        open_for_dept = len([t for t in open_tickets if emp_dept.get(t["employee_id"]) == dept["id"]])
        loads.append(
            {
                "department_id": dept["id"],
                "department_name": dept["name"],
                "headcount": headcount,
                "open_tickets": open_for_dept,
                "tickets_per_employee": (open_for_dept / headcount) if headcount > 0 else 0,
                "load_index": 0,
            }
        )

    avg_ratio = mean([l["tickets_per_employee"] for l in loads]) or 1
    for l in loads:
        l["load_index"] = js_round((l["tickets_per_employee"] / avg_ratio) * 100) / 100 if avg_ratio > 0 else 1

    return sorted(loads, key=lambda l: l["load_index"], reverse=True)


def suggest_reallocations(loads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Pairs the most overloaded departments with the most underloaded ones and
    proposes a small headcount transfer sized to close roughly half the
    gap — a conservative simulation of a resourcing rebalance, not a hard
    mandate.
    """
    overloaded = sorted([l for l in loads if l["load_index"] >= 1.3], key=lambda l: l["load_index"], reverse=True)
    underloaded = sorted([l for l in loads if l["load_index"] <= 0.7], key=lambda l: l["load_index"])

    suggestions = []
    used_underloaded: set[str] = set()

    for over in overloaded:
        under = next((u for u in underloaded if u["department_id"] not in used_underloaded), None)
        if under is None:
            continue
        used_underloaded.add(under["department_id"])

        headcount_to_move = max(1, int(js_round(min(over["headcount"], under["headcount"]) * 0.15)))
        urgency = "high" if over["load_index"] >= 2 else "medium" if over["load_index"] >= 1.6 else "low"

        suggestions.append(
            {
                "from_department_id": under["department_id"],
                "from_department_name": under["department_name"],
                "to_department_id": over["department_id"],
                "to_department_name": over["department_name"],
                "headcount_to_move": headcount_to_move,
                "urgency": urgency,
                "rationale": (
                    f"{over['department_name']} is running {over['load_index']:.1f}x the average ticket load "
                    f"per employee ({over['open_tickets']} open tickets across {over['headcount']} people), "
                    f"while {under['department_name']} is at {under['load_index']:.1f}x."
                ),
            }
        )

    return suggestions
