"""Ported 1:1 from ml/flightRisk.ts."""

import math
from typing import Any, Optional

from app.lib.util import clamp, js_num, js_round, now_utc, parse_dt

WEIGHTS = {
    "tenure": 0.15,
    "performance": 0.2,
    "pto_burnout": 0.15,
    "compensation_gap": 0.25,
    "overtime": 0.15,
    "vacation_gap": 0.1,
}

BAND_ORDER = ["low", "moderate", "high", "severe"]
BAND_STEP = {
    "overtimeHoursMonth": 1,
    "daysSinceVacation": 1,
    "salary": 1000,
}


def _round(n: float) -> float:
    return js_round(n * 100) / 100


def _years_since(date_str: str) -> float:
    delta = now_utc() - parse_dt(date_str)
    return delta.total_seconds() / (60 * 60 * 24 * 365.25)


def compute_flight_risk(employee: dict[str, Any], overrides: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """
    Deterministic, explainable "model": each HR-meaningful signal is mapped
    to a 0-100 sub-score, then blended with fixed weights. This stands in
    for a trained gradient-boosted classifier while staying fully
    inspectable and safe to run for the what-if simulator.
    """
    overrides = overrides or {}
    overtime_hours = overrides.get("overtimeHoursMonth", employee["overtime_hours_month"])
    days_since_vacation = overrides.get("daysSinceVacation", employee["days_since_vacation"])
    salary = overrides.get("salary", employee["salary"])

    tenure_years = _years_since(employee["hire_date"])
    tenure_score = 70 if tenure_years < 1 else 45 if tenure_years < 2 else 40 if tenure_years > 6 else 15

    performance_score_val = employee["performance_score"]
    performance_score = 55 if performance_score_val >= 90 else 65 if performance_score_val < 60 else 20

    pto_unused = max(0, employee["pto_balance"])
    pto_burnout_score = clamp((pto_unused / 25) * 100, 0, 100)

    comp_gap_pct = (employee["market_salary"] - salary) / employee["market_salary"] if salary > 0 else 0
    compensation_gap_score = clamp(comp_gap_pct * 400, 0, 100)

    overtime_score = clamp((overtime_hours / 40) * 100, 0, 100)

    vacation_gap_score = clamp((days_since_vacation / 270) * 100, 0, 100)

    factors = [
        {
            "factor": "tenure",
            "label": "Tenure",
            "impact": _round(tenure_score * WEIGHTS["tenure"]),
            "detail": f"{tenure_years:.1f} years at company",
        },
        {
            "factor": "performance",
            "label": "Performance trajectory",
            "impact": _round(performance_score * WEIGHTS["performance"]),
            "detail": f"Performance score {performance_score_val:.0f}/100",
        },
        {
            "factor": "pto_burnout",
            "label": "Unused PTO (burnout proxy)",
            "impact": _round(pto_burnout_score * WEIGHTS["pto_burnout"]),
            "detail": f"{pto_unused:.1f} PTO days banked",
        },
        {
            "factor": "compensation_gap",
            "label": "Compensation vs. market",
            "impact": _round(compensation_gap_score * WEIGHTS["compensation_gap"]),
            "detail": (
                f"{comp_gap_pct * 100:.1f}% below market rate"
                if comp_gap_pct > 0
                else "At or above market rate"
            ),
        },
        {
            "factor": "overtime",
            "label": "Overtime load",
            "impact": _round(overtime_score * WEIGHTS["overtime"]),
            "detail": f"{overtime_hours:.0f} overtime hrs/month",
        },
        {
            "factor": "vacation_gap",
            "label": "Days since last vacation",
            "impact": _round(vacation_gap_score * WEIGHTS["vacation_gap"]),
            "detail": f"{js_num(days_since_vacation)} days since last PTO block",
        },
    ]

    score = clamp(_round(sum(f["impact"] for f in factors)), 0, 100)

    band = "severe" if score >= 70 else "high" if score >= 50 else "moderate" if score >= 30 else "low"

    return {"employee_id": employee["id"], "score": score, "band": band, "factors": factors}


def compute_flight_risk_counterfactuals(employee: dict[str, Any], bounds: dict[str, tuple[float, float]]) -> dict[str, Any]:
    """
    For each of the 3 adjustable levers, binary-searches (toward the
    risk-reducing direction only, holding the other two levers at their real
    current values) for the minimum change that drops the employee to the
    next-better band. Reuses compute_flight_risk directly per bisection
    step — it's pure arithmetic, so ~30 calls per lever costs microseconds.
    """
    current = compute_flight_risk(employee)
    current_band_index = BAND_ORDER.index(current["band"])

    if current["band"] == "low":
        return {"employee_id": employee["id"], "currentBand": current["band"], "suggestions": []}

    levers = [
        ("overtimeHoursMonth", employee["overtime_hours_month"], bounds["overtimeHoursMonth"]),
        ("daysSinceVacation", employee["days_since_vacation"], bounds["daysSinceVacation"]),
        ("salary", employee["salary"], bounds["salary"]),
    ]

    suggestions = []
    for lever, current_value, bound in levers:
        # overtime/vacation reduce risk by going down toward min; salary reduces risk by going up toward max.
        risk_reducing_bound = bound[1] if lever == "salary" else bound[0]

        def band_at(value: float, _lever: str = lever) -> str:
            return compute_flight_risk(employee, {_lever: value})["band"]

        if band_at(risk_reducing_bound) == current["band"] or BAND_ORDER.index(band_at(risk_reducing_bound)) >= current_band_index:
            suggestions.append(
                {"lever": lever, "currentValue": current_value, "suggestedValue": None, "achievesBand": None, "bounds": list(bound)}
            )
            continue

        if lever == "salary":
            lo, hi = current_value, risk_reducing_bound
        else:
            lo, hi = risk_reducing_bound, current_value

        # Invariant: band(lo side toward current) is current.band; band(hi side toward risk_reducing_bound) is better.
        for _ in range(30):
            if hi - lo <= 0.01:
                break
            mid = (lo + hi) / 2
            mid_is_better = BAND_ORDER.index(band_at(mid)) < current_band_index
            if lever == "salary":
                if mid_is_better:
                    hi = mid
                else:
                    lo = mid
            else:
                if mid_is_better:
                    lo = mid
                else:
                    hi = mid

        boundary_value = hi if lever == "salary" else lo
        step = BAND_STEP[lever]
        # Round outward (away from current value) so the rounded suggestion still crosses the boundary.
        suggested_value = (
            math.ceil(boundary_value / step) * step
            if lever == "salary"
            else math.floor(boundary_value / step) * step
        )

        suggestions.append(
            {
                "lever": lever,
                "currentValue": current_value,
                "suggestedValue": suggested_value,
                "achievesBand": band_at(suggested_value),
                "bounds": list(bound),
            }
        )

    return {"employee_id": employee["id"], "currentBand": current["band"], "suggestions": suggestions}
