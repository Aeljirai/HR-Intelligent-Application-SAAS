"""
Ported 1:1 from scripts/smoke-test-ml.ts — a sanity check for every pure
ML/analytics function against hand-built fixtures with known expected
outcomes. Not a replacement for real tests, just a fast logic check.
"""

from datetime import date, timedelta

import pytest

from app.ml.anomaly_detection import detect_attendance_anomalies
from app.ml.compensation_sandbox import simulate_compensation_change
from app.ml.flight_risk import compute_flight_risk
from app.ml.headcount_forecast import forecast_headcount
from app.ml.ona_graph import build_ona_graph
from app.ml.resource_reallocation import compute_department_loads, suggest_reallocations
from app.ml.sentiment import analyze_sentiment, attempt_tier0_resolution, decide_routing, detect_category, detect_urgency
from app.ml.shift_optimizer import optimize_shifts
from app.ml.turnover_model import compute_turnover_risk, compute_turnover_risk_batch

DEPT1 = {"id": "d1", "name": "Engineering", "region": "SF", "budget": 1_000_000, "kpi_completion": 80, "output_score": 75, "manager_employee_id": None}
DEPT2 = {"id": "d2", "name": "Support", "region": "Austin", "budget": 500_000, "kpi_completion": 60, "output_score": 55, "manager_employee_id": None}
DEPARTMENTS = [DEPT1, DEPT2]


def make_employee(**overrides):
    base = {
        "id": "e1",
        "profile_id": None,
        "full_name": "Test Employee",
        "email": "test@company.com",
        "department_id": DEPT1["id"],
        "job_title": "Engineer",
        "seniority": "mid",
        "hire_date": "2023-01-01",
        "termination_date": None,
        "salary": 90000,
        "market_salary": 95000,
        "performance_score": 75,
        "pto_balance": 10,
        "pto_used_ytd": 5,
        "manager_id": None,
        "status": "active",
        "region": "SF",
        "lat": 37.77,
        "lng": -122.41,
        "overtime_hours_month": 5,
        "days_since_vacation": 60,
    }
    base.update(overrides)
    return base


@pytest.fixture
def employees():
    return [
        make_employee(id="e1", full_name="Nadia", department_id=DEPT1["id"], hire_date="2018-01-01"),
        make_employee(id="e2", full_name="Karim", department_id=DEPT1["id"], hire_date="2024-06-01", performance_score=50),
        make_employee(id="e3", full_name="Salma", department_id=DEPT2["id"], hire_date="2022-03-01", salary=60000, market_salary=85000),
        make_employee(id="e4", full_name="Yassine", department_id=DEPT2["id"], hire_date="2021-05-01"),
    ]


# ---- 1. flight risk --------------------------------------------------------
def test_flight_risk_underpaid_scores_higher(employees):
    underpaid = compute_flight_risk(employees[2])  # Salma: 30% under market
    well_paid = compute_flight_risk(employees[3])
    assert underpaid["score"] > well_paid["score"]


def test_flight_risk_score_within_bounds(employees):
    result = compute_flight_risk(employees[2])
    assert 0 <= result["score"] <= 100


def test_flight_risk_whatif_sliders_increase_score(employees):
    well_paid = compute_flight_risk(employees[3])
    simulated = compute_flight_risk(employees[3], {"daysSinceVacation": 300, "overtimeHoursMonth": 45})
    assert simulated["score"] > well_paid["score"]


# ---- 2. sentiment / tickets -------------------------------------------------
def test_sentiment_detects_negative():
    negative = analyze_sentiment("This is unacceptable, I am extremely frustrated and angry.")
    assert negative["label"] == "negative"


def test_sentiment_detects_positive():
    positive = analyze_sentiment("Thanks so much, this was really helpful and great!")
    assert positive["label"] == "positive"


def test_urgency_critical_keywords():
    assert detect_urgency("This is an emergency, possible harassment situation") == "critical"


def test_category_pto_classified_correctly():
    assert detect_category("How many vacation days do I have left?") == "pto"


def test_tier0_pto_balance_autoresolves(employees):
    tier0 = attempt_tier0_resolution("How many vacation days do I have left?", employees[0])
    assert tier0["resolved"] is True
    assert tier0.get("note")


def test_routing_critical_conduct_escalates():
    negative = analyze_sentiment("This is unacceptable, I am extremely frustrated and angry.")
    routing = decide_routing("critical", negative, "conduct")
    assert routing["escalate"] is True


# ---- 3. attendance anomaly detection ----------------------------------------
@pytest.fixture
def attendance():
    records = []
    today = date.today()
    for i in range(20, -1, -1):
        d = today - timedelta(days=i)
        date_str = d.isoformat()
        spike = i <= 6  # last 7 days spike for dept2
        records.append({"id": f"a1-{i}", "employee_id": "e3", "date": date_str, "status": "absent" if spike else "present", "check_in": "09:00:00", "check_out": "17:00:00", "hours_worked": 8})
        records.append({"id": f"a2-{i}", "employee_id": "e4", "date": date_str, "status": "absent" if spike else "present", "check_in": "09:00:00", "check_out": "17:00:00", "hours_worked": 8})
        records.append({"id": f"a3-{i}", "employee_id": "e1", "date": date_str, "status": "present", "check_in": "09:00:00", "check_out": "17:00:00", "hours_worked": 8})
    return records


def test_anomaly_detection_flags_spike_department(attendance, employees):
    anomalies = detect_attendance_anomalies(attendance, employees, DEPARTMENTS)
    assert any(a["department_id"] == DEPT2["id"] for a in anomalies)


def test_anomaly_detection_does_not_flag_stable_department(attendance, employees):
    anomalies = detect_attendance_anomalies(attendance, employees, DEPARTMENTS)
    assert not any(a["department_id"] == DEPT1["id"] for a in anomalies)


# ---- 4. headcount forecast ---------------------------------------------------
def test_headcount_forecast_returns_6_forward_months(employees):
    forecast = forecast_headcount(employees, 6)
    assert len([p for p in forecast if p["forecast"] is not None]) == 6


def test_headcount_forecast_upper_band_at_least_point_forecast(employees):
    forecast = forecast_headcount(employees, 6)
    assert all(p["upper"] is None or p["upper"] >= (p["forecast"] or 0) for p in forecast)


# ---- 5. ONA graph -------------------------------------------------------------
@pytest.fixture
def memberships():
    return [
        {"id": "m1", "project_id": "p1", "employee_id": "e1", "role_on_project": "lead"},
        {"id": "m2", "project_id": "p1", "employee_id": "e2", "role_on_project": "contributor"},
        {"id": "m3", "project_id": "p2", "employee_id": "e1", "role_on_project": "contributor"},
        {"id": "m4", "project_id": "p2", "employee_id": "e3", "role_on_project": "contributor"},
    ]


def test_ona_graph_flags_cross_department_bridge(employees, memberships):
    graph = build_ona_graph(employees, memberships)
    nadia = next(n for n in graph["nodes"] if n["id"] == "e1")
    assert nadia["role"] == "bridge"


def test_ona_graph_flags_no_links_as_isolated(employees, memberships):
    graph = build_ona_graph(employees, memberships)
    yassine = next(n for n in graph["nodes"] if n["id"] == "e4")
    assert yassine["role"] == "isolated"


# ---- 6. shift optimizer --------------------------------------------------------
def test_shift_optimizer_returns_3_candidate_windows(attendance, employees):
    plan = optimize_shifts(attendance, employees, DEPT2["id"])
    assert len(plan["windows"]) == 3


def test_shift_optimizer_identifies_a_peak_window(attendance, employees):
    plan = optimize_shifts(attendance, employees, DEPT2["id"])
    assert any(w["is_peak"] for w in plan["windows"])


# ---- 7. resource reallocation -----------------------------------------------
@pytest.fixture
def tickets():
    now = "2024-01-01T00:00:00Z"
    base = {"subject": "x", "description": "x", "category": "it", "sentiment_label": "neutral", "sentiment_score": 0, "urgency": "high", "tier0_resolved": False, "resolution_note": None, "created_at": now, "resolved_at": None}
    return [
        {**base, "id": "t1", "employee_id": "e3", "status": "open"},
        {**base, "id": "t2", "employee_id": "e4", "status": "open"},
        {**base, "id": "t3", "employee_id": "e3", "status": "in_progress"},
    ]


def test_reallocation_overloaded_department_has_load_index_above_1(employees, tickets):
    loads = compute_department_loads(DEPARTMENTS, employees, tickets)
    dept2_load = next(l for l in loads if l["department_id"] == DEPT2["id"])
    assert dept2_load["load_index"] > 1


def test_reallocation_produces_suggestion_given_clear_imbalance(employees, tickets):
    loads = compute_department_loads(DEPARTMENTS, employees, tickets)
    suggestions = suggest_reallocations(loads)
    assert len(suggestions) > 0


# ---- 8. compensation sandbox --------------------------------------------------
def test_compensation_sandbox_increase_raises_total_payroll(employees):
    sandbox = simulate_compensation_change(employees, DEPARTMENTS, 10)
    assert sandbox["total_adjusted"] > sandbox["total_current"]


def test_compensation_sandbox_delta_math_is_consistent(employees):
    sandbox = simulate_compensation_change(employees, DEPARTMENTS, 10)
    assert abs(sandbox["total_delta"] - (sandbox["total_adjusted"] - sandbox["total_current"])) < 0.01


# ---- 9. turnover model (Kaggle-ported Random Forest) --------------------------
LOW_RISK_PROFILE = {
    "satisfactionLevel": 0.9, "lastEvaluation": 0.85, "numberProject": 4, "averageMonthlyHours": 180,
    "timeSpendCompany": 3, "workAccident": 0, "promotionLast5Years": 1, "department": "technical", "salaryBucket": 2,
}
HIGH_RISK_PROFILE = {
    "satisfactionLevel": 0.15, "lastEvaluation": 0.5, "numberProject": 6, "averageMonthlyHours": 280,
    "timeSpendCompany": 4, "workAccident": 0, "promotionLast5Years": 0, "department": "sales", "salaryBucket": 0,
}


def test_turnover_model_high_risk_scores_higher():
    low_risk = compute_turnover_risk("e-low", LOW_RISK_PROFILE)
    high_risk = compute_turnover_risk("e-high", HIGH_RISK_PROFILE)
    assert high_risk["probability"] > low_risk["probability"]


def test_turnover_model_probability_within_bounds():
    low_risk = compute_turnover_risk("e-low", LOW_RISK_PROFILE)
    assert 0 <= low_risk["probability"] <= 1


def test_turnover_model_exposes_feature_importance():
    high_risk = compute_turnover_risk("e-high", HIGH_RISK_PROFILE)
    assert len(high_risk["feature_importance"]) > 0


def test_turnover_model_importances_sum_to_roughly_100():
    high_risk = compute_turnover_risk("e-high", HIGH_RISK_PROFILE)
    total = sum(f["importance_pct"] for f in high_risk["feature_importance"])
    assert abs(total - 100) < 1


def test_turnover_model_batch_returns_one_result_per_input():
    batch = compute_turnover_risk_batch(
        [
            {"employee_id": "e-low", "features": LOW_RISK_PROFILE},
            {"employee_id": "e-high", "features": HIGH_RISK_PROFILE},
        ]
    )
    assert len(batch) == 2
