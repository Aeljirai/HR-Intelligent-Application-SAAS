/**
 * Tiny hand-rolled statistics helpers (mean / stddev / OLS linear
 * regression). We deliberately avoid pulling in a stats library for
 * something this small — one less dependency to install, and the whole
 * implementation is auditable in a screen.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Ordinary least squares fit of y = m*x + b over points [x, y][]. */
export function linearRegression(points: [number, number][]): { m: number; b: number } {
  const n = points.length;
  if (n === 0) return { m: 0, b: 0 };
  if (n === 1) return { m: 0, b: points[0]![1] };

  const sumX = points.reduce((s, [x]) => s + x, 0);
  const sumY = points.reduce((s, [, y]) => s + y, 0);
  const sumXY = points.reduce((s, [x, y]) => s + x * y, 0);
  const sumXX = points.reduce((s, [x]) => s + x * x, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { m: 0, b: sumY / n };

  const m = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - m * sumX) / n;
  return { m, b };
}

export function linearRegressionLine(coef: { m: number; b: number }) {
  return (x: number) => coef.m * x + coef.b;
}
