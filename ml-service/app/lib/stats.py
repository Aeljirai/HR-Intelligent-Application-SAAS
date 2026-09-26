"""
Tiny hand-rolled statistics helpers (mean / stddev / OLS linear regression).
We deliberately avoid pulling in numpy/scipy for something this small — one
less dependency to install, and the whole implementation is auditable in a
screen. Ported 1:1 from lib/stats.ts.
"""

import math
from typing import Callable, Sequence


def mean(values: Sequence[float]) -> float:
    if len(values) == 0:
        return 0
    return sum(values) / len(values)


def standard_deviation(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0
    m = mean(values)
    variance = sum((v - m) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(variance)


def linear_regression(points: Sequence[tuple[float, float]]) -> tuple[float, float]:
    """Ordinary least squares fit of y = m*x + b over (x, y) points. Returns (m, b)."""
    n = len(points)
    if n == 0:
        return (0, 0)
    if n == 1:
        return (0, points[0][1])

    sum_x = sum(x for x, _ in points)
    sum_y = sum(y for _, y in points)
    sum_xy = sum(x * y for x, y in points)
    sum_xx = sum(x * x for x, _ in points)

    denominator = n * sum_xx - sum_x * sum_x
    if denominator == 0:
        return (0, sum_y / n)

    m = (n * sum_xy - sum_x * sum_y) / denominator
    b = (sum_y - m * sum_x) / n
    return (m, b)


def linear_regression_line(m: float, b: float) -> Callable[[float], float]:
    return lambda x: m * x + b
