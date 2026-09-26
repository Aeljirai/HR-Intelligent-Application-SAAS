"""Ported 1:1 from ml/sentimentPulse.ts."""

from collections import defaultdict
from typing import Any

from app.lib.util import js_round

OWN_WEIGHT = 0.6
NEIGHBOR_WEIGHT = 0.4


def compute_sentiment_pulse(
    employee_ids: list[str], tickets: list[dict[str, Any]], graph: dict[str, Any]
) -> list[dict[str, Any]]:
    """
    Blends each employee's own ticket sentiment with their ONA neighbors' —
    a single diffusion round, not an iterative/convergent simulation, kept
    deliberately simple and explainable to match this service's other
    hand-rolled algorithms. An employee with zero tickets defaults to 0
    (neutral) — "no data" is treated as no signal, not assumed unhappiness.
    Isolated nodes (no ONA edges) keep their personal sentiment unchanged —
    there's no neighbor average to blend in, so diluting toward 0 would be
    a bug, not a feature.
    """
    id_set = set(employee_ids)

    sentiment_sums: dict[str, list[float]] = defaultdict(lambda: [0.0, 0])
    for t in tickets:
        if t["employee_id"] not in id_set or t.get("sentiment_score") is None:
            continue
        entry = sentiment_sums[t["employee_id"]]
        entry[0] += t["sentiment_score"]
        entry[1] += 1

    personal_by_id: dict[str, float] = {}
    ticket_count_by_id: dict[str, int] = {}
    for eid in employee_ids:
        entry = sentiment_sums.get(eid)
        personal_by_id[eid] = (entry[0] / entry[1]) if entry else 0
        ticket_count_by_id[eid] = int(entry[1]) if entry else 0

    neighbors: dict[str, list[str]] = defaultdict(list)
    for edge in graph["edges"]:
        if edge["source"] in id_set and edge["target"] in id_set:
            neighbors[edge["source"]].append(edge["target"])
            neighbors[edge["target"]].append(edge["source"])

    results = []
    for eid in employee_ids:
        personal = personal_by_id[eid]
        neighbor_ids = neighbors.get(eid, [])
        if not neighbor_ids:
            pulse = personal
        else:
            neighbor_avg = sum(personal_by_id.get(n, 0) for n in neighbor_ids) / len(neighbor_ids)
            pulse = OWN_WEIGHT * personal + NEIGHBOR_WEIGHT * neighbor_avg

        results.append(
            {
                "employee_id": eid,
                "personal_sentiment": js_round(personal * 1000) / 1000,
                "pulse": js_round(pulse * 1000) / 1000,
                "ticket_count": ticket_count_by_id.get(eid, 0),
            }
        )

    return results
