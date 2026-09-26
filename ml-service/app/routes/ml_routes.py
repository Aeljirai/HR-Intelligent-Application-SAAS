"""
Ported 1:1 from routes/ml.routes.ts. Field names on every request model
below are pinned exactly to what backend/src/main/java/.../MlServiceClient.java
and its DTOs (FlightRiskOverrides, RiskBounds, TurnoverFeatures) actually
send — this service's wire schema is a real, intentional mix of snake_case
and camelCase across endpoints (an organic inconsistency carried over from
the original Node service, not a typo), so it is preserved exactly rather
than "cleaned up".

`employee` / `department` / `attendance` / `ticket` payloads are typed as
loose dicts (Dict[str, Any]), not strict Pydantic models — this service
trusts its caller (the backend, over the internal Docker network) to have
already fetched/shaped the rows from Supabase; it only re-validates that the
expected top-level request fields exist.
"""

from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.ml.anomaly_detection import detect_attendance_anomalies
from app.ml.compensation_sandbox import simulate_compensation_change
from app.ml.flight_risk import compute_flight_risk, compute_flight_risk_counterfactuals
from app.ml.headcount_forecast import forecast_headcount
from app.ml.ona_graph import build_ona_graph
from app.ml.resource_reallocation import compute_department_loads, suggest_reallocations
from app.ml.sentiment import analyze_sentiment, attempt_tier0_resolution, decide_routing, detect_category, detect_urgency
from app.ml.sentiment_pulse import compute_sentiment_pulse
from app.ml.shift_optimizer import optimize_shifts
from app.ml.turnover_model import compute_turnover_risk, compute_turnover_risk_batch

router = APIRouter()

EmployeeDict = dict[str, Any]


# ---------------------------------------------------------------------
# flight risk
# ---------------------------------------------------------------------
class FlightRiskOverrides(BaseModel):
    overtimeHoursMonth: Optional[float] = None
    daysSinceVacation: Optional[float] = None
    salary: Optional[float] = None


class FlightRiskComputeRequest(BaseModel):
    employee: EmployeeDict
    overrides: Optional[FlightRiskOverrides] = None


@router.post("/flight-risk/compute")
def flight_risk_compute(body: FlightRiskComputeRequest):
    overrides = body.overrides.model_dump(exclude_none=True) if body.overrides else None
    return compute_flight_risk(body.employee, overrides)


class FlightRiskComputeBatchRequest(BaseModel):
    employees: list[EmployeeDict]


@router.post("/flight-risk/compute-batch")
def flight_risk_compute_batch(body: FlightRiskComputeBatchRequest):
    return [compute_flight_risk(e) for e in body.employees]


class RiskBounds(BaseModel):
    overtimeHoursMonth: tuple[float, float]
    daysSinceVacation: tuple[float, float]
    salary: tuple[float, float]


class FlightRiskCounterfactualsRequest(BaseModel):
    employee: EmployeeDict
    bounds: RiskBounds


@router.post("/flight-risk/counterfactuals")
def flight_risk_counterfactuals(body: FlightRiskCounterfactualsRequest):
    return compute_flight_risk_counterfactuals(body.employee, body.bounds.model_dump())


# ---------------------------------------------------------------------
# turnover model
# ---------------------------------------------------------------------
class TurnoverFeatures(BaseModel):
    satisfactionLevel: float
    lastEvaluation: float
    numberProject: float
    averageMonthlyHours: float
    timeSpendCompany: float
    workAccident: Literal[0, 1]
    promotionLast5Years: Literal[0, 1]
    department: str
    salaryBucket: Literal[0, 1, 2]


class TurnoverComputeRequest(BaseModel):
    employee_id: str
    features: TurnoverFeatures


@router.post("/turnover-model/compute")
def turnover_model_compute(body: TurnoverComputeRequest):
    return compute_turnover_risk(body.employee_id, body.features.model_dump())


class TurnoverComputeBatchItem(BaseModel):
    employee_id: str
    features: TurnoverFeatures


class TurnoverComputeBatchRequest(BaseModel):
    items: list[TurnoverComputeBatchItem]


@router.post("/turnover-model/compute-batch")
def turnover_model_compute_batch(body: TurnoverComputeBatchRequest):
    items = [{"employee_id": i.employee_id, "features": i.features.model_dump()} for i in body.items]
    return compute_turnover_risk_batch(items)


# ---------------------------------------------------------------------
# sentiment
# ---------------------------------------------------------------------
class SentimentAnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    employee: Optional[EmployeeDict] = None


@router.post("/sentiment/analyze")
def sentiment_analyze(body: SentimentAnalyzeRequest):
    sentiment = analyze_sentiment(body.text)
    urgency = detect_urgency(body.text)
    category = detect_category(body.text)
    routing = decide_routing(urgency, sentiment, category)
    tier0 = attempt_tier0_resolution(body.text, body.employee)
    return {"sentiment": sentiment, "urgency": urgency, "category": category, "routing": routing, "tier0": tier0}


# ---------------------------------------------------------------------
# anomaly detection
# ---------------------------------------------------------------------
class AnomalyDetectionRequest(BaseModel):
    attendance: list[EmployeeDict]
    employees: list[EmployeeDict]
    departments: list[EmployeeDict]


@router.post("/anomaly-detection")
def anomaly_detection(body: AnomalyDetectionRequest):
    return detect_attendance_anomalies(body.attendance, body.employees, body.departments)


# ---------------------------------------------------------------------
# headcount forecast
# ---------------------------------------------------------------------
class HeadcountForecastRequest(BaseModel):
    employees: list[EmployeeDict]
    monthsAhead: Optional[int] = Field(default=None, ge=1, le=24)


@router.post("/headcount-forecast")
def headcount_forecast(body: HeadcountForecastRequest):
    return forecast_headcount(body.employees, body.monthsAhead)


# ---------------------------------------------------------------------
# ONA graph
# ---------------------------------------------------------------------
class OnaGraphRequest(BaseModel):
    employees: list[EmployeeDict]
    memberships: list[EmployeeDict]


@router.post("/ona-graph")
def ona_graph(body: OnaGraphRequest):
    return build_ona_graph(body.employees, body.memberships)


# ---------------------------------------------------------------------
# sentiment pulse
# ---------------------------------------------------------------------
class OnaGraphPayload(BaseModel):
    nodes: list[EmployeeDict]
    edges: list[EmployeeDict]


class SentimentPulseRequest(BaseModel):
    employeeIds: list[str]
    tickets: list[EmployeeDict]
    graph: OnaGraphPayload


@router.post("/sentiment-pulse")
def sentiment_pulse(body: SentimentPulseRequest):
    return compute_sentiment_pulse(body.employeeIds, body.tickets, body.graph.model_dump())


# ---------------------------------------------------------------------
# compensation sandbox
# ---------------------------------------------------------------------
class CompensationSandboxRequest(BaseModel):
    employees: list[EmployeeDict]
    departments: list[EmployeeDict]
    adjustment_pct: float = Field(ge=-10, le=15)


@router.post("/compensation-sandbox")
def compensation_sandbox(body: CompensationSandboxRequest):
    return simulate_compensation_change(body.employees, body.departments, body.adjustment_pct)


# ---------------------------------------------------------------------
# shift optimizer
# ---------------------------------------------------------------------
class ShiftOptimizerRequest(BaseModel):
    attendance: list[EmployeeDict]
    employees: list[EmployeeDict]
    departmentId: Optional[str] = None


@router.post("/shift-optimizer")
def shift_optimizer(body: ShiftOptimizerRequest):
    return optimize_shifts(body.attendance, body.employees, body.departmentId)


# ---------------------------------------------------------------------
# resource reallocation
# ---------------------------------------------------------------------
class ResourceReallocationRequest(BaseModel):
    departments: list[EmployeeDict]
    employees: list[EmployeeDict]
    tickets: list[EmployeeDict]


@router.post("/resource-reallocation")
def resource_reallocation(body: ResourceReallocationRequest):
    loads = compute_department_loads(body.departments, body.employees, body.tickets)
    return {"loads": loads, "suggestions": suggest_reallocations(loads)}
