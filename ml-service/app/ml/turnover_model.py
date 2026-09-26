"""
Hand-rolled Random Forest ported from the Kaggle notebook
dalekube/employee-flight-risk-model — trained offline once (see
scripts/train_turnover_model.py) on the public HR_comma_sep.csv dataset
(CC0), never retrained at runtime. That dataset is a different population
than this app's own seeded employees, so treat the probability as
illustrative/demo-quality rather than a validated prediction for this
specific org. This is a complement to, not a replacement for, the existing
explainable flight_risk.py score — that one stays the source of per-employee
"why" factors and drives the What-If Simulator; this one only adds a second,
independently-trained signal.

Ported 1:1 from ml/turnoverModel.ts. The forest itself (turnover_forest.json)
is the exact artifact produced by the original TypeScript trainer — no
retraining was needed for this port, only the inference code.
"""

import json
from pathlib import Path
from typing import Any

from app.lib.util import js_round
from app.ml.turnover_feature_schema import to_feature_vector

_FOREST_PATH = Path(__file__).parent / "turnover_forest.json"
with _FOREST_PATH.open("r", encoding="utf-8") as f:
    _forest_data = json.load(f)

TREES: list[dict[str, Any]] = _forest_data["trees"]
FEATURE_IMPORTANCE: list[dict[str, Any]] = _forest_data["featureImportance"]


def _predict_proba(node: dict[str, Any], features: list[float]) -> float:
    node_type = node["t"]
    if node_type == 0:
        return node["p"]
    if node_type == 1:
        return _predict_proba(node["l"], features) if features[node["f"]] <= node["th"] else _predict_proba(node["r"], features)
    # t == 2: categorical split via bitmask
    return (
        _predict_proba(node["l"], features)
        if (node["mask"] & (1 << int(features[node["f"]]))) != 0
        else _predict_proba(node["r"], features)
    )


def compute_turnover_risk(employee_id: str, features_input: dict[str, Any]) -> dict[str, Any]:
    features = to_feature_vector(features_input)
    total = sum(_predict_proba(tree, features) for tree in TREES)
    probability = js_round((total / len(TREES)) * 1000) / 1000
    band = "severe" if probability >= 0.7 else "high" if probability >= 0.5 else "moderate" if probability >= 0.3 else "low"
    return {
        "employee_id": employee_id,
        "probability": probability,
        "band": band,
        "feature_importance": FEATURE_IMPORTANCE,
    }


def compute_turnover_risk_batch(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [compute_turnover_risk(item["employee_id"], item["features"]) for item in items]
