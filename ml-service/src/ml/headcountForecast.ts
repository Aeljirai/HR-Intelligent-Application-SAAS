import { linearRegression, linearRegressionLine } from '../lib/stats.js';
import type { Employee } from '../types.js';

export interface HeadcountPoint {
  month: string; // YYYY-MM
  actual: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
}

/**
 * Reconstructs historical month-end headcount from hire/termination dates,
 * fits a linear trend, then projects `monthsAhead` forward with a widening
 * confidence band driven by the observed month-over-month volatility
 * (a stand-in for a proper time-series model's prediction interval).
 */
export function forecastHeadcount(employees: Employee[], monthsAhead = 6): HeadcountPoint[] {
  const now = new Date();
  const historyMonths = 12;
  const months: string[] = [];
  for (let i = historyMonths - 1; i >= 0; i--) {
    months.push(monthKey(addMonths(now, -i)));
  }

  const actuals = months.map((m) => headcountAtMonthEnd(employees, m));
  const points: HeadcountPoint[] = months.map((m, i) => ({
    month: m,
    actual: actuals[i] ?? 0,
    forecast: null,
    lower: null,
    upper: null,
  }));

  const xy: [number, number][] = actuals.map((v, i) => [i, v ?? 0]);
  const { m: slope, b: intercept } = linearRegression(xy);
  const predict = linearRegressionLine({ m: slope, b: intercept });

  const deltas = actuals.slice(1).map((v, i) => (v ?? 0) - (actuals[i] ?? 0));
  const volatility = deltas.length
    ? Math.sqrt(deltas.reduce((s, d) => s + d * d, 0) / deltas.length)
    : 1;

  const lastIndex = months.length - 1;
  for (let i = 1; i <= monthsAhead; i++) {
    const idx = lastIndex + i;
    const monthLabel = monthKey(addMonths(now, i));
    const point = Math.max(0, Math.round(predict(idx)));
    const band = Math.max(1, Math.round(volatility * Math.sqrt(i) * 1.6));
    points.push({
      month: monthLabel,
      actual: null,
      forecast: point,
      lower: Math.max(0, point - band),
      upper: point + band,
    });
  }

  return points;
}

function headcountAtMonthEnd(employees: Employee[], monthKeyStr: string): number {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y!, m!, 0, 23, 59, 59)); // last day of that month
  return employees.filter((e) => {
    const hired = new Date(e.hire_date) <= cutoff;
    const stillEmployed = !e.termination_date || new Date(e.termination_date) > cutoff;
    return hired && stillEmployed;
  }).length;
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMonths(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
