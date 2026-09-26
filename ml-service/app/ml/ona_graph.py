"""Ported 1:1 from ml/onaGraph.ts."""

from collections import defaultdict
from typing import Any


def _pair_key(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def build_ona_graph(employees: list[dict[str, Any]], memberships: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Builds a lightweight organizational network graph from shared project
    membership: two employees get an edge (weighted by co-occurrence count)
    whenever they've worked the same project. Bridge employees are the ones
    whose links span multiple departments — they're the informal glue
    between teams; isolated employees have 0-1 links total.
    """
    employee_by_id = {e["id"]: e for e in employees}
    by_project: dict[str, list[str]] = defaultdict(list)
    for m in memberships:
        if m["employee_id"] not in employee_by_id:
            continue
        by_project[m["project_id"]].append(m["employee_id"])

    edge_weights: dict[tuple[str, str], int] = defaultdict(int)
    for members in by_project.values():
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                key = _pair_key(members[i], members[j])
                edge_weights[key] += 1

    edges = [{"source": source, "target": target, "weight": weight} for (source, target), weight in edge_weights.items()]

    degree: dict[str, int] = defaultdict(int)
    cross_dept_links: dict[str, int] = defaultdict(int)
    for edge in edges:
        degree[edge["source"]] += 1
        degree[edge["target"]] += 1
        a = employee_by_id.get(edge["source"])
        b = employee_by_id.get(edge["target"])
        if a and b and a["department_id"] != b["department_id"]:
            cross_dept_links[edge["source"]] += 1
            cross_dept_links[edge["target"]] += 1

    degrees = [degree.get(e["id"], 0) for e in employees]
    avg_degree = (sum(degrees) / len(degrees)) if degrees else 0

    nodes = []
    for e in employees:
        d = degree.get(e["id"], 0)
        cross = cross_dept_links.get(e["id"], 0)
        if d <= 1:
            role = "isolated"
        elif cross >= 1:
            role = "bridge"  # touches more than one department's cluster
        elif d >= avg_degree * 1.5:
            role = "core"
        else:
            role = "standard"

        nodes.append(
            {
                "id": e["id"],
                "full_name": e["full_name"],
                "department_id": e["department_id"],
                "degree": d,
                "cross_department_links": cross,
                "role": role,
            }
        )

    return {"nodes": nodes, "edges": edges}
