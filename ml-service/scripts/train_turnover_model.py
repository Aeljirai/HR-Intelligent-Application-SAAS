"""
Offline trainer for the turnover-risk Random Forest, ported from the Kaggle
notebook dalekube/employee-flight-risk-model. Trains a genuine bagged-CART
ensemble (Gini-impurity splits, bootstrap sampling, random feature subset
per split) on the public HR_comma_sep.csv dataset and writes the serialized
forest to app/ml/turnover_forest.json.

This is a manual, occasional step — like backend's seed runner — never run
at container start or from the Dockerfile. Re-run only if the training data
or hyperparameters change:

    python scripts/train_turnover_model.py   (from ml-service/, with the
                                               venv from requirements-dev.txt active)

Dataset source: https://www.kaggle.com/datasets/liujiaqi/hr-comma-sepcsv
(CC0: Public Domain), ~14,999 rows, predicting voluntary attrition.

Ported 1:1 from scripts/train-turnover-model.ts, including the same
deterministic LCG PRNG, so a re-run with unchanged data/hyperparameters
reproduces the same tree structure as the original TypeScript trainer.
"""

import json
import sys
import time
from pathlib import Path
from typing import Any, Optional

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR.parent))

from app.ml.turnover_feature_schema import FEATURE_NAMES, KAGGLE_DEPARTMENTS, to_feature_vector  # noqa: E402

# ---- deterministic PRNG (same LCG style as backend's seed runner, so a
# re-run reproduces the same tree structure for review) ---------------------
#
# This must replicate JS's *imprecise* float64 arithmetic bit-for-bit, not
# compute the mathematically exact result: `seedState * 1103515245` regularly
# exceeds 2^53 (the largest integer a float64 can represent exactly), so JS's
# multiply silently rounds before the `& 0x7fffffff` truncates it to 31 bits.
# Using Python's arbitrary-precision ints here (the obvious-looking port)
# computes the *exact* product instead and diverges from JS after the very
# first call — verified against `bun -e` dumping the original LCG's raw
# sequence: only float-in, float-out arithmetic reproduces it.
_seed_state = 42.0


def rand() -> float:
    global _seed_state
    product = _seed_state * 1103515245 + 12345  # float64 multiply+add, same rounding as JS
    _seed_state = float(int(product) & 0x7FFFFFFF)  # truncate toward zero, then mask — mirrors JS's `& 0x7fffffff`
    return _seed_state / 0x7FFFFFFF


def rand_int(lo: int, hi: int) -> int:
    import math

    return math.floor(rand() * (hi - lo + 1)) + lo


# ---- load + parse the CSV (no quoted fields in this dataset, plain split
# is safe) --------------------------------------------------------------
#
# The dataset file has CRLF line endings, and the original TS trainer reads
# it with Node's `fs.readFileSync(path, 'utf8')` — which does NOT strip \r —
# then splits only on '\n', leaving a trailing "\r" on the last column of
# every line (e.g. "low\r"). That never matches a SALARY_BUCKET key, so the
# original trainer's salaryBucket feature silently defaults to 1 (medium)
# for every single row — a latent bug in the original, not something
# introduced here, and it's why the shipped model's feature-importance
# breakdown already shows salary contributing ~0%. `newline=""` disables
# Python's usual universal-newline translation so `\r` survives the read
# the same way, preserving that behavior for reproducibility. Fixing the
# parsing (stripping `\r`) would change what the retrained model learns —
# a legitimate thing to want, but a deliberate choice for whoever retrains,
# not a silent side effect of this port.
CSV_PATH = SCRIPT_DIR.parent / "data" / "HR_comma_sep.csv"
with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
    lines = f.read().strip().split("\n")
data_lines = lines[1:]  # drop header

SALARY_BUCKET = {"low": 0, "medium": 1, "high": 2}

rows = []
for line in data_lines:
    c = line.split(",")
    input_row = {
        "satisfactionLevel": float(c[0]),
        "lastEvaluation": float(c[1]),
        "numberProject": float(c[2]),
        "averageMonthlyHours": float(c[3]),
        "timeSpendCompany": float(c[4]),
        "workAccident": int(c[5]),
        "promotionLast5Years": int(c[7]),
        "department": c[8],
        "salaryBucket": SALARY_BUCKET.get(c[9], 1),
    }
    rows.append({"input": input_row, "left": int(c[6])})

X = [to_feature_vector(r["input"]) for r in rows]
y = [r["left"] for r in rows]
N_FEATURES = len(FEATURE_NAMES)
CATEGORICAL_FEATURE = FEATURE_NAMES.index("department")

print(f"Loaded {len(rows)} rows from {CSV_PATH}")
print(f"Departments seen: {len(set(r['input']['department'] for r in rows))} / {len(KAGGLE_DEPARTMENTS)}")

# ---- CART + bagging --------------------------------------------------------
N_TREES = 200
MTRY = 4
MAX_DEPTH = 12
MIN_SAMPLES_SPLIT = 20
MIN_SAMPLES_LEAF = 10

feature_importance = [0.0] * N_FEATURES


def gini(pos: int, n: int) -> float:
    if n == 0:
        return 0
    p = pos / n
    return 1 - p * p - (1 - p) * (1 - p)


def make_leaf(indices: list[int]) -> dict[str, Any]:
    n = len(indices)
    pos = sum(y[i] for i in indices)
    return {"t": 0, "n": n, "pos": pos, "p": (pos / n) if n else 0}


def pick_feature_subset() -> list[int]:
    pool = list(range(N_FEATURES))
    chosen = []
    while len(chosen) < MTRY and pool:
        idx = rand_int(0, len(pool) - 1)
        chosen.append(pool.pop(idx))
    return chosen


def unique_in_order(values: list[float]) -> list[float]:
    """Mirrors JS `Array.from(new Set(values))` — dedups while preserving
    first-occurrence insertion order, which Python's built-in set() does
    not guarantee."""
    seen: dict[float, None] = {}
    for v in values:
        seen.setdefault(v, None)
    return list(seen.keys())


def split_gain(left_idx: list[int], right_idx: list[int], parent_gini: float, n: int) -> float:
    left_pos = sum(y[i] for i in left_idx)
    right_pos = sum(y[i] for i in right_idx)
    left_gini = gini(left_pos, len(left_idx))
    right_gini = gini(right_pos, len(right_idx))
    weighted = (len(left_idx) / n) * left_gini + (len(right_idx) / n) * right_gini
    return parent_gini - weighted


def best_split_for_feature(indices: list[int], feature: int, parent_gini: float, n: int) -> Optional[dict[str, Any]]:
    if feature == CATEGORICAL_FEATURE:
        # Unordered categorical (department, <=10 levels actually present at
        # this node): exhaustive subset-partition search, same as CART/
        # randomForest use for unordered factors with <=32 levels.
        present = unique_in_order([X[i][feature] for i in indices])
        k = len(present)
        if k < 2:
            return None
        best = None
        subset_count = 1 << k
        for subset in range(1, subset_count - 1):
            complement = subset_count - 1 - subset
            if subset > complement:
                continue  # skip mirrored duplicate partitions
            mask = 0
            for b in range(k):
                if subset & (1 << b):
                    mask |= 1 << int(present[b])
            left_idx = []
            right_idx = []
            for i in indices:
                if mask & (1 << int(X[i][feature])):
                    left_idx.append(i)
                else:
                    right_idx.append(i)
            if len(left_idx) < MIN_SAMPLES_LEAF or len(right_idx) < MIN_SAMPLES_LEAF:
                continue
            gain = split_gain(left_idx, right_idx, parent_gini, n)
            if gain > 0 and (best is None or gain > best["gain"]):
                best = {"feature": feature, "gain": gain, "isCategory": True, "mask": mask, "leftIdx": left_idx, "rightIdx": right_idx}
        return best

    # Numeric / ordinal / boolean: exhaustive threshold search over sorted
    # midpoints between distinct values present at this node.
    values = sorted(set(X[i][feature] for i in indices))
    if len(values) < 2:
        return None
    best = None
    for vi in range(len(values) - 1):
        threshold = (values[vi] + values[vi + 1]) / 2
        left_idx = [i for i in indices if X[i][feature] <= threshold]
        right_idx = [i for i in indices if X[i][feature] > threshold]
        if len(left_idx) < MIN_SAMPLES_LEAF or len(right_idx) < MIN_SAMPLES_LEAF:
            continue
        gain = split_gain(left_idx, right_idx, parent_gini, n)
        if gain > 0 and (best is None or gain > best["gain"]):
            best = {"feature": feature, "gain": gain, "isCategory": False, "threshold": threshold, "leftIdx": left_idx, "rightIdx": right_idx}
    return best


def build_tree(indices: list[int], depth: int) -> dict[str, Any]:
    n = len(indices)
    pos = sum(y[i] for i in indices)
    if depth >= MAX_DEPTH or n < MIN_SAMPLES_SPLIT or pos == 0 or pos == n:
        return make_leaf(indices)

    parent_gini = gini(pos, n)
    candidate_features = pick_feature_subset()
    best = None
    for feat in candidate_features:
        candidate = best_split_for_feature(indices, feat, parent_gini, n)
        if candidate and (best is None or candidate["gain"] > best["gain"]):
            best = candidate
    if not best:
        return make_leaf(indices)

    feature_importance[best["feature"]] += best["gain"] * n

    left = build_tree(best["leftIdx"], depth + 1)
    right = build_tree(best["rightIdx"], depth + 1)
    if best["isCategory"]:
        return {"t": 2, "f": best["feature"], "mask": best["mask"], "l": left, "r": right}
    return {"t": 1, "f": best["feature"], "th": best["threshold"], "l": left, "r": right}


def balanced_bootstrap(all_indices: list[int]) -> list[int]:
    """Balanced-bootstrap: equal-sized with-replacement draws from each
    class, to combat the ~24%/76% class imbalance without threading
    per-sample weights through every Gini calculation."""
    positives = [i for i in all_indices if y[i] == 1]
    negatives = [i for i in all_indices if y[i] == 0]
    n_minority = min(len(positives), len(negatives))
    sample = [positives[rand_int(0, len(positives) - 1)] for _ in range(n_minority)]
    sample += [negatives[rand_int(0, len(negatives) - 1)] for _ in range(n_minority)]
    return sample


def train_forest(all_indices: list[int], n_trees: int) -> list[dict[str, Any]]:
    trees = []
    for t in range(n_trees):
        trees.append(build_tree(balanced_bootstrap(all_indices), 0))
        if (t + 1) % 50 == 0:
            print(f"  tree {t + 1}/{n_trees}")
    return trees


def predict_proba(node: dict[str, Any], features: list[float]) -> float:
    if node["t"] == 0:
        return node["p"]
    if node["t"] == 1:
        return predict_proba(node["l"], features) if features[node["f"]] <= node["th"] else predict_proba(node["r"], features)
    return (
        predict_proba(node["l"], features)
        if (node["mask"] & (1 << int(features[node["f"]]))) != 0
        else predict_proba(node["r"], features)
    )


def forest_predict(forest: list[dict[str, Any]], features: list[float]) -> float:
    return sum(predict_proba(tree, features) for tree in forest) / len(forest)


# ---- 1. Evaluation pass: 80/20 holdout, just for a printed sanity metric ---
all_idx = list(range(len(X)))
for i in range(len(all_idx) - 1, 0, -1):
    j = rand_int(0, i)
    all_idx[i], all_idx[j] = all_idx[j], all_idx[i]
split_point = int(len(all_idx) * 0.8)
train_idx = all_idx[:split_point]
holdout_idx = all_idx[split_point:]

print(f"\nTraining evaluation forest on {len(train_idx)} rows, holding out {len(holdout_idx)}...")
eval_forest = train_forest(train_idx, N_TREES)
correct = 0
for i in holdout_idx:
    predicted = 1 if forest_predict(eval_forest, X[i]) >= 0.5 else 0
    if predicted == y[i]:
        correct += 1
holdout_accuracy_pct = (correct / len(holdout_idx)) * 100
print(f"Holdout accuracy: {holdout_accuracy_pct:.2f}%")

# ---- 2. Final forest: trained on the full dataset, this is what ships -----
print(f"\nTraining final forest on all {len(X)} rows...")
feature_importance = [0.0] * N_FEATURES  # only the final forest's importance is shipped
final_forest = train_forest(all_idx, N_TREES)

total_importance = sum(feature_importance) or 1
feature_importance_out = sorted(
    (
        {"feature": name, "importance_pct": round((feature_importance[i] / total_importance) * 1000) / 10}
        for i, name in enumerate(FEATURE_NAMES)
    ),
    key=lambda f: f["importance_pct"],
    reverse=True,
)

print("\nFeature importance:")
for f in feature_importance_out:
    print(f"  {f['feature']}: {f['importance_pct']}%")

base_positive_rate = (sum(y) / len(y)) * 100

artifact = {
    "version": 1,
    "trainedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    "featureNames": FEATURE_NAMES,
    "kaggleDepartments": KAGGLE_DEPARTMENTS,
    "trees": final_forest,
    "featureImportance": feature_importance_out,
    "meta": {
        "nTrees": N_TREES,
        "maxDepth": MAX_DEPTH,
        "mtry": MTRY,
        "trainingRows": len(X),
        "baseRatePct": round(base_positive_rate * 10) / 10,
        "holdoutAccuracyPct": round(holdout_accuracy_pct * 10) / 10,
    },
}

OUT_PATH = SCRIPT_DIR.parent / "app" / "ml" / "turnover_forest.json"
with OUT_PATH.open("w", encoding="utf-8") as f:
    # Compact separators (no spaces) match JSON.stringify's default output —
    # json.dump's default inserts a space after every "," and ":", which
    # would needlessly bloat a ~200-tree artifact by ~25%.
    json.dump(artifact, f, separators=(",", ":"))
print(f"\nWrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024 / 1024:.2f} MB)")
