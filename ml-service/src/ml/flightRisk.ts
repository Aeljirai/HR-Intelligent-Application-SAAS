import type { Employee } from '../types.js';

export interface FlightRiskFactor {
  factor: 'tenure' | 'performance' | 'pto_burnout' | 'compensation_gap' | 'overtime' | 'vacation_gap';
  label: string;
  impact: number; // 0-100 contribution to the overall score
  detail: string;
}

export interface FlightRiskResult {
  employee_id: string;
  score: number; // 0-100, higher = more likely to leave
  band: 'low' | 'moderate' | 'high' | 'severe';
  factors: FlightRiskFactor[];
}

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

/**
 * Deterministic, explainable "model": each HR-meaningful signal is mapped to
 * a 0-100 sub-score, then blended with fixed weights. This stands in for a
 * trained gradient-boosted classifier while staying fully inspectable and
 * safe to run client-side for the what-if simulator.
 */
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
    employee.performance_score >= 90
      ? 55 // flight risk for top performers who may be poached
      : employee.performance_score < 60
        ? 65 // disengagement risk
        : 20;

  const ptoUnused = Math.max(0, employee.pto_balance);
  const ptoBurnoutScore = clamp((ptoUnused / 25) * 100, 0, 100);

  const compGapPct = salary > 0 ? (employee.market_salary - salary) / employee.market_salary : 0;
  const compensationGapScore = clamp(compGapPct * 400, 0, 100); // >25% under market -> maxed out

  const overtimeScore = clamp((overtimeHours / 40) * 100, 0, 100);

  const vacationGapScore = clamp((daysSinceVacation / 270) * 100, 0, 100);

  const factors: FlightRiskFactor[] = [
    {
      factor: 'tenure',
      label: 'Tenure',
      impact: round(tenureScore * WEIGHTS.tenure),
      detail: `${tenureYears.toFixed(1)} years at company`,
    },
    {
      factor: 'performance',
      label: 'Performance trajectory',
      impact: round(performanceScore * WEIGHTS.performance),
      detail: `Performance score ${employee.performance_score.toFixed(0)}/100`,
    },
    {
      factor: 'pto_burnout',
      label: 'Unused PTO (burnout proxy)',
      impact: round(ptoBurnoutScore * WEIGHTS.pto_burnout),
      detail: `${ptoUnused.toFixed(1)} PTO days banked`,
    },
    {
      factor: 'compensation_gap',
      label: 'Compensation vs. market',
      impact: round(compensationGapScore * WEIGHTS.compensation_gap),
      detail:
        compGapPct > 0
          ? `${(compGapPct * 100).toFixed(1)}% below market rate`
          : `At or above market rate`,
    },
    {
      factor: 'overtime',
      label: 'Overtime load',
      impact: round(overtimeScore * WEIGHTS.overtime),
      detail: `${overtimeHours.toFixed(0)} overtime hrs/month`,
    },
    {
      factor: 'vacation_gap',
      label: 'Days since last vacation',
      impact: round(vacationGapScore * WEIGHTS.vacation_gap),
      detail: `${daysSinceVacation} days since last PTO block`,
    },
  ];

  const score = clamp(
    round(factors.reduce((sum, f) => sum + f.impact, 0)),
    0,
    100
  );

  const band: FlightRiskResult['band'] =
    score >= 70 ? 'severe' : score >= 50 ? 'high' : score >= 30 ? 'moderate' : 'low';

  return { employee_id: employee.id, score, band, factors };
}

export interface FlightRiskLeverSuggestion {
  lever: 'overtimeHoursMonth' | 'daysSinceVacation' | 'salary';
  currentValue: number;
  suggestedValue: number | null;
  achievesBand: FlightRiskResult['band'] | null;
  bounds: [number, number];
}

export interface FlightRiskCounterfactuals {
  employee_id: string;
  currentBand: FlightRiskResult['band'];
  suggestions: FlightRiskLeverSuggestion[];
}

const BAND_ORDER: FlightRiskResult['band'][] = ['low', 'moderate', 'high', 'severe'];
const BAND_STEP: Record<FlightRiskLeverSuggestion['lever'], number> = {
  overtimeHoursMonth: 1,
  daysSinceVacation: 1,
  salary: 1000,
};

/**
 * For each of the 3 adjustable levers, binary-searches (toward the
 * risk-reducing direction only, holding the other two levers at their real
 * current values) for the minimum change that drops the employee to the
 * next-better band. Reuses computeFlightRisk directly per bisection step —
 * it's pure arithmetic, so ~30 calls per lever costs microseconds.
 */
export function computeFlightRiskCounterfactuals(
  employee: Employee,
  bounds: {
    overtimeHoursMonth: [number, number];
    daysSinceVacation: [number, number];
    salary: [number, number];
  }
): FlightRiskCounterfactuals {
  const current = computeFlightRisk(employee);
  const currentBandIndex = BAND_ORDER.indexOf(current.band);

  if (current.band === 'low') {
    return { employee_id: employee.id, currentBand: current.band, suggestions: [] };
  }

  const levers: { lever: FlightRiskLeverSuggestion['lever']; currentValue: number; bound: [number, number] }[] = [
    { lever: 'overtimeHoursMonth', currentValue: employee.overtime_hours_month, bound: bounds.overtimeHoursMonth },
    { lever: 'daysSinceVacation', currentValue: employee.days_since_vacation, bound: bounds.daysSinceVacation },
    { lever: 'salary', currentValue: employee.salary, bound: bounds.salary },
  ];

  const suggestions = levers.map(({ lever, currentValue, bound }) => {
    // overtime/vacation reduce risk by going down toward min; salary reduces risk by going up toward max.
    const riskReducingBound = lever === 'salary' ? bound[1] : bound[0];

    const bandAt = (value: number) => computeFlightRisk(employee, { [lever]: value } as FlightRiskOverrides).band;

    // Already saturated at the risk-minimizing end and band hasn't improved — no lever exists.
    if (bandAt(riskReducingBound) === current.band || BAND_ORDER.indexOf(bandAt(riskReducingBound)) >= currentBandIndex) {
      return { lever, currentValue, suggestedValue: null, achievesBand: null, bounds: bound };
    }

    let lo = lever === 'salary' ? currentValue : riskReducingBound;
    let hi = lever === 'salary' ? riskReducingBound : currentValue;
    // Invariant: band(lo side toward current) is current.band; band(hi side toward riskReducingBound) is better.
    for (let i = 0; i < 30 && hi - lo > 0.01; i++) {
      const mid = (lo + hi) / 2;
      const midIsBetter = BAND_ORDER.indexOf(bandAt(mid)) < currentBandIndex;
      if (lever === 'salary') {
        if (midIsBetter) hi = mid;
        else lo = mid;
      } else {
        if (midIsBetter) lo = mid;
        else hi = mid;
      }
    }

    const boundaryValue = lever === 'salary' ? hi : lo;
    const step = BAND_STEP[lever];
    // Round outward (away from current value) so the rounded suggestion still crosses the boundary.
    const suggestedValue =
      lever === 'salary'
        ? Math.ceil(boundaryValue / step) * step
        : Math.floor(boundaryValue / step) * step;

    return { lever, currentValue, suggestedValue, achievesBand: bandAt(suggestedValue), bounds: bound };
  });

  return { employee_id: employee.id, currentBand: current.band, suggestions };
}

function yearsSince(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime();
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
