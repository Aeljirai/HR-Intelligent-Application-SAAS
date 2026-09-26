"""
Shared feature schema for the turnover-risk Random Forest (ported from the
Kaggle notebook dalekube/employee-flight-risk-model). Used by both the
offline trainer (scripts/train_turnover_model.py) and the runtime inference
module (turnover_model.py) — kept separate so the trainer doesn't have to
import the not-yet-generated forest JSON.
"""

from typing import Any

# Fixed ordering from the training dataset (HR_comma_sep.csv) — index
# position is baked into every serialized tree's categorical split masks.
# Do not reorder without retraining.
KAGGLE_DEPARTMENTS = [
    "sales",
    "technical",
    "support",
    "IT",
    "product_mng",
    "marketing",
    "RandD",
    "accounting",
    "hr",
    "management",
]

# Index-aligned with each tree's feature index (0-8).
FEATURE_NAMES = [
    "satisfaction_level",
    "last_evaluation",
    "number_project",
    "average_monthly_hours",
    "time_spend_company",
    "work_accident",
    "promotion_last_5years",
    "department",
    "salary",
]


def to_feature_vector(input: dict[str, Any]) -> list[float]:
    """The exact encoding used both to build training feature vectors and to
    featurize a live employee at inference time — keeping this in one place
    guarantees the two stay consistent."""
    try:
        dept_idx = KAGGLE_DEPARTMENTS.index(input["department"])
    except ValueError:
        dept_idx = len(KAGGLE_DEPARTMENTS) - 1

    return [
        input["satisfactionLevel"],
        input["lastEvaluation"],
        input["numberProject"],
        input["averageMonthlyHours"],
        input["timeSpendCompany"],
        input["workAccident"],
        input["promotionLast5Years"],
        dept_idx,
        input["salaryBucket"],
    ]
