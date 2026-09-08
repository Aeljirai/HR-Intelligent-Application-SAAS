import type { Employee, FlightRiskFactor, FlightRiskResult } from '@/types';

/**
 * Client-side mirror of backend/src/services/ml/flightRisk.ts.
 *
 * Why duplicate this instead of calling the API? The Flight Risk Simulator
 * lets an HR manager drag three sliders (overtime, days since vacation,
 * salary-vs-market) and see the gauge move in real time. Round-tripping to
 * the server on every pixel of drag would feel laggy and burn API calls for
 * no reason — this is exactly the kind of "predictive/ML" surface that's
 * appropriate to simulate entirely client-side against data already in
 * memory. The persisted score shown elsewhere in the app (Employees list)
 * still comes from the server, which remains the source of truth.
 */

export interface FlightRiskOverrides {
  overtimeHoursMonth?: number;
  daysSinceVacation?: number;
  salary?: number;
}

const WEIGHTS = {
  tenure: 0.15,
  performance: 0.2,
  pto_burnout: 0.15,
  compensation_gap: 0.25,
  overtime: 0.15,
  vacation_gap: 0.1,
};

export function computeFlightRisk(
  employee: Employee,
  overrides: FlightRiskOverrides = {}
): FlightRiskResult {
  const overtimeHours = overrides.overtimeHoursMonth ?? employee.overtime_hours_month;
  const daysSinceVacation = overrides.daysSinceVacation ?? employee.days_since_vacation;
  const salary = overrides.salary ?? employee.salary;

  const tenureYears = yearsSince(employee.hire_date);
  const tenureScore = tenureYears < 1 ? 70 : tenureYears < 2 ? 45 : tenureYears > 6 ? 40 : 15;

  const performanceScore =
    employee.performance_score >= 90 ? 55 : employee.performance_score < 60 ? 65 : 20;

  const ptoUnused = Math.max(0, employee.pto_balance);
  const ptoBurnoutScore = clamp((ptoUnused / 25) * 100, 0, 100);

  const compGapPct = salary > 0 ? (employee.market_salary - salary) / employee.market_salary : 0;
  const compensationGapScore = clamp(compGapPct * 400, 0, 100);

  const overtimeScore = clamp((overtimeHours / 40) * 100, 0, 100);
  const vacationGapScore = clamp((daysSinceVacation / 270) * 100, 0, 100);

  const factors: FlightRiskFactor[] = [
    { factor: 'tenure', label: 'Tenure', impact: round(tenureScore * WEIGHTS.tenure), detail: `${tenureYears.toFixed(1)} years at company` },
    { factor: 'performance', label: 'Performance trajectory', impact: round(performanceScore * WEIGHTS.performance), detail: `Performance score ${employee.performance_score.toFixed(0)}/100` },
    { factor: 'pto_burnout', label: 'Unused PTO (burnout proxy)', impact: round(ptoBurnoutScore * WEIGHTS.pto_burnout), detail: `${ptoUnused.toFixed(1)} PTO days banked` },
    { factor: 'compensation_gap', label: 'Compensation vs. market', impact: round(compensationGapScore * WEIGHTS.compensation_gap), detail: compGapPct > 0 ? `${(compGapPct * 100).toFixed(1)}% below market rate` : 'At or above market rate' },
    { factor: 'overtime', label: 'Overtime load', impact: round(overtimeScore * WEIGHTS.overtime), detail: `${overtimeHours.toFixed(0)} overtime hrs/month` },
    { factor: 'vacation_gap', label: 'Days since last vacation', impact: round(vacationGapScore * WEIGHTS.vacation_gap), detail: `${daysSinceVacation} days since last PTO block` },
  ];

  const score = clamp(round(factors.reduce((sum, f) => sum + f.impact, 0)), 0, 100);
  const band: FlightRiskResult['band'] = score >= 70 ? 'severe' : score >= 50 ? 'high' : score >= 30 ? 'moderate' : 'low';

  return { employee_id: employee.id, score, band, factors };
}

function yearsSince(dateStr: string) {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function round(n: number) {
  return Math.round(n * 100) / 100;
}
