/**
 * Zero-dependency sanity check for the pure ML/analytics functions —
 * runnable with just `bun run scripts/smoke-test-ml.ts` (or `tsx`), no
 * npm install required, since none of the modules it touches import
 * third-party packages. Not a replacement for real tests, just a fast
 * logic check. (The NL agent command tests live in backend/scripts/
 * smoke-test-agent.ts now, since command parsing/execution stayed there.)
 */
import { detectAttendanceAnomalies } from '../src/ml/anomalyDetection.js';
import { forecastHeadcount } from '../src/ml/headcountForecast.js';
import { computeFlightRisk } from '../src/ml/flightRisk.js';
import { computeTurnoverRisk, computeTurnoverRiskBatch } from '../src/ml/turnoverModel.js';
import { buildOnaGraph } from '../src/ml/onaGraph.js';
import {
  analyzeSentiment,
  attemptTier0Resolution,
  detectCategory,
  detectUrgency,
  decideRouting,
} from '../src/ml/sentiment.js';
import { optimizeShifts } from '../src/ml/shiftOptimizer.js';
import { computeDepartmentLoads, suggestReallocations } from '../src/ml/resourceReallocation.js';
import { simulateCompensationChange } from '../src/ml/compensationSandbox.js';
import type { AttendanceRecord, Department, Employee, ProjectMember, Ticket } from '../src/types.js';

let failures = 0;
function assert(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

// ---- fixtures ---------------------------------------------------------
const dept1: Department = { id: 'd1', name: 'Engineering', region: 'SF', budget: 1_000_000, kpi_completion: 80, output_score: 75, manager_employee_id: null };
const dept2: Department = { id: 'd2', name: 'Support', region: 'Austin', budget: 500_000, kpi_completion: 60, output_score: 55, manager_employee_id: null };
const departments = [dept1, dept2];

function makeEmployee(overrides: Partial<Employee>): Employee {
  return {
    id: 'e1',
    profile_id: null,
    full_name: 'Test Employee',
    email: 'test@company.com',
    department_id: dept1.id,
    job_title: 'Engineer',
    seniority: 'mid',
    hire_date: '2023-01-01',
    termination_date: null,
    salary: 90000,
    market_salary: 95000,
    performance_score: 75,
    pto_balance: 10,
    pto_used_ytd: 5,
    manager_id: null,
    status: 'active',
    region: 'SF',
    lat: 37.77,
    lng: -122.41,
    overtime_hours_month: 5,
    days_since_vacation: 60,
    ...overrides,
  };
}

const employees: Employee[] = [
  makeEmployee({ id: 'e1', full_name: 'Alice', department_id: dept1.id, hire_date: '2018-01-01' }),
  makeEmployee({ id: 'e2', full_name: 'Bob', department_id: dept1.id, hire_date: '2024-06-01', performance_score: 50 }),
  makeEmployee({ id: 'e3', full_name: 'Carla', department_id: dept2.id, hire_date: '2022-03-01', salary: 60000, market_salary: 85000 }),
  makeEmployee({ id: 'e4', full_name: 'Dan', department_id: dept2.id, hire_date: '2021-05-01' }),
];

// ---- 1. flight risk -----------------------------------------------------
const underpaid = computeFlightRisk(employees[2]!); // Carla: 30% under market
const wellPaid = computeFlightRisk(employees[3]!);
assert(underpaid.score > wellPaid.score, `flight risk: underpaid employee scores higher (${underpaid.score} > ${wellPaid.score})`);
assert(underpaid.score >= 0 && underpaid.score <= 100, 'flight risk: score is within 0-100');

const simulated = computeFlightRisk(employees[3]!, { daysSinceVacation: 300, overtimeHoursMonth: 45 });
assert(simulated.score > wellPaid.score, 'flight risk: what-if sliders increase score as expected');

// ---- 2. sentiment / tickets ----------------------------------------------
const negative = analyzeSentiment('This is unacceptable, I am extremely frustrated and angry.');
const positive = analyzeSentiment('Thanks so much, this was really helpful and great!');
assert(negative.label === 'negative', `sentiment: detects negative (${negative.label}, ${negative.score})`);
assert(positive.label === 'positive', `sentiment: detects positive (${positive.label}, ${positive.score})`);
assert(detectUrgency('This is an emergency, possible harassment situation') === 'critical', 'urgency: critical keywords detected');
assert(detectCategory('How many vacation days do I have left?') === 'pto', 'category: PTO question classified correctly');
const tier0 = attemptTier0Resolution('How many vacation days do I have left?', employees[0]!);
assert(tier0.resolved === true && !!tier0.note, 'tier-0: PTO balance query auto-resolves');
const routing = decideRouting('critical', negative, 'conduct');
assert(routing.escalate === true, 'routing: critical + conduct escalates');

// ---- 3. attendance anomaly detection --------------------------------------
const attendance: AttendanceRecord[] = [];
for (let i = 20; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const date = d.toISOString().slice(0, 10);
  const spike = i <= 6; // last 7 days spike for dept2
  attendance.push({ id: `a1-${i}`, employee_id: 'e3', date, status: spike ? 'absent' : 'present', check_in: '09:00:00', check_out: '17:00:00', hours_worked: 8 });
  attendance.push({ id: `a2-${i}`, employee_id: 'e4', date, status: spike ? 'absent' : 'present', check_in: '09:00:00', check_out: '17:00:00', hours_worked: 8 });
  attendance.push({ id: `a3-${i}`, employee_id: 'e1', date, status: 'present', check_in: '09:00:00', check_out: '17:00:00', hours_worked: 8 });
}
const anomalies = detectAttendanceAnomalies(attendance, employees, departments);
assert(anomalies.some((a) => a.department_id === dept2.id), 'anomaly detection: flags the department with the injected spike');
assert(!anomalies.some((a) => a.department_id === dept1.id), 'anomaly detection: does not flag the stable department');

// ---- 4. headcount forecast -------------------------------------------------
const forecast = forecastHeadcount(employees, 6);
assert(forecast.filter((p) => p.forecast !== null).length === 6, 'headcount forecast: returns 6 forward-looking months');
assert(forecast.every((p) => p.upper === null || p.upper >= (p.forecast ?? 0)), 'headcount forecast: upper band >= point forecast');

// ---- 5. ONA graph -----------------------------------------------------------
const memberships: ProjectMember[] = [
  { id: 'm1', project_id: 'p1', employee_id: 'e1', role_on_project: 'lead' },
  { id: 'm2', project_id: 'p1', employee_id: 'e2', role_on_project: 'contributor' },
  { id: 'm3', project_id: 'p2', employee_id: 'e1', role_on_project: 'contributor' },
  { id: 'm4', project_id: 'p2', employee_id: 'e3', role_on_project: 'contributor' },
];
const graph = buildOnaGraph(employees, memberships);
const alice = graph.nodes.find((n) => n.id === 'e1')!;
assert(alice.role === 'bridge', `ONA: Alice (cross-dept links) flagged as bridge (got ${alice.role})`);
const dan = graph.nodes.find((n) => n.id === 'e4')!;
assert(dan.role === 'isolated', `ONA: Dan (no project links) flagged as isolated (got ${dan.role})`);

// ---- 6. shift optimizer ------------------------------------------------------
const shiftPlan = optimizeShifts(attendance, employees, dept2.id);
assert(shiftPlan.windows.length === 3, 'shift optimizer: returns 3 candidate windows');
assert(shiftPlan.windows.some((w) => w.is_peak), 'shift optimizer: identifies a peak window');

// ---- 7. resource reallocation -------------------------------------------------
const tickets: Ticket[] = [
  { id: 't1', employee_id: 'e3', subject: 'x', description: 'x', category: 'it', sentiment_label: 'neutral', sentiment_score: 0, urgency: 'high', status: 'open', tier0_resolved: false, resolution_note: null, created_at: new Date().toISOString(), resolved_at: null },
  { id: 't2', employee_id: 'e4', subject: 'x', description: 'x', category: 'it', sentiment_label: 'neutral', sentiment_score: 0, urgency: 'high', status: 'open', tier0_resolved: false, resolution_note: null, created_at: new Date().toISOString(), resolved_at: null },
  { id: 't3', employee_id: 'e3', subject: 'x', description: 'x', category: 'it', sentiment_label: 'neutral', sentiment_score: 0, urgency: 'high', status: 'in_progress', tier0_resolved: false, resolution_note: null, created_at: new Date().toISOString(), resolved_at: null },
];
const loads = computeDepartmentLoads(departments, employees, tickets);
const suggestions = suggestReallocations(loads);
assert(loads.find((l) => l.department_id === dept2.id)!.load_index > 1, 'reallocation: overloaded department has load_index > 1');
assert(suggestions.length > 0, 'reallocation: produces at least one suggestion given a clear imbalance');

// ---- 8. compensation sandbox ------------------------------------------------
const sandbox = simulateCompensationChange(employees, departments, 10);
assert(sandbox.total_adjusted > sandbox.total_current, 'compensation sandbox: +10% increases total payroll');
assert(Math.abs(sandbox.total_delta - (sandbox.total_adjusted - sandbox.total_current)) < 0.01, 'compensation sandbox: delta math is consistent');

// ---- 9. turnover model (Kaggle-ported Random Forest) ------------------------
const lowRiskProfile = {
  satisfactionLevel: 0.9, lastEvaluation: 0.85, numberProject: 4, averageMonthlyHours: 180,
  timeSpendCompany: 3, workAccident: 0 as const, promotionLast5Years: 1 as const, department: 'technical' as const, salaryBucket: 2 as const,
};
const highRiskProfile = {
  satisfactionLevel: 0.15, lastEvaluation: 0.5, numberProject: 6, averageMonthlyHours: 280,
  timeSpendCompany: 4, workAccident: 0 as const, promotionLast5Years: 0 as const, department: 'sales' as const, salaryBucket: 0 as const,
};
const lowRisk = computeTurnoverRisk('e-low', lowRiskProfile);
const highRisk = computeTurnoverRisk('e-high', highRiskProfile);
assert(highRisk.probability > lowRisk.probability, `turnover model: high-risk profile scores higher (${highRisk.probability} > ${lowRisk.probability})`);
assert(lowRisk.probability >= 0 && lowRisk.probability <= 1, 'turnover model: probability within [0,1]');
assert(highRisk.feature_importance.length > 0, 'turnover model: exposes feature importance');
const importanceSum = highRisk.feature_importance.reduce((s, f) => s + f.importance_pct, 0);
assert(Math.abs(importanceSum - 100) < 1, `turnover model: feature importances sum to ~100 (${importanceSum})`);

const turnoverBatch = computeTurnoverRiskBatch([
  { employee_id: 'e-low', features: lowRiskProfile },
  { employee_id: 'e-high', features: highRiskProfile },
]);
assert(turnoverBatch.length === 2, 'turnover model: batch returns one result per input');

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
