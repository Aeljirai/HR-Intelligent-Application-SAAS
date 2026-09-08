import type { Department, Employee } from '../types.js';

export interface CompensationImpact {
  department_id: string;
  department_name: string;
  headcount: number;
  current_payroll: number;
  adjusted_payroll: number;
  delta: number;
}

export interface CompensationSandboxResult {
  adjustment_pct: number;
  total_current: number;
  total_adjusted: number;
  total_delta: number;
  by_department: CompensationImpact[];
  by_employee: { employee_id: string; full_name: string; current: number; adjusted: number }[];
}

/**
 * Applies a uniform percentage adjustment (-10%..+15% in the UI) to every
 * active employee's salary and rolls the impact up by department, so HR can
 * see the payroll consequence of an across-the-board raise/freeze before
 * committing to it.
 */
export function simulateCompensationChange(
  employees: Employee[],
  departments: Department[],
  adjustmentPct: number
): CompensationSandboxResult {
  const active = employees.filter((e) => e.status === 'active');
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  const byEmployee = active.map((e) => ({
    employee_id: e.id,
    full_name: e.full_name,
    current: e.salary,
    adjusted: Math.round(e.salary * (1 + adjustmentPct / 100)),
  }));

  const byDeptMap = new Map<string, CompensationImpact>();
  for (const e of active) {
    const key = e.department_id ?? 'unassigned';
    const existing = byDeptMap.get(key) ?? {
      department_id: key,
      department_name: deptName.get(key) ?? 'Unassigned',
      headcount: 0,
      current_payroll: 0,
      adjusted_payroll: 0,
      delta: 0,
    };
    existing.headcount += 1;
    existing.current_payroll += e.salary;
    existing.adjusted_payroll += Math.round(e.salary * (1 + adjustmentPct / 100));
    existing.delta = existing.adjusted_payroll - existing.current_payroll;
    byDeptMap.set(key, existing);
  }

  const byDepartment = Array.from(byDeptMap.values()).sort((a, b) => b.current_payroll - a.current_payroll);
  const totalCurrent = byDepartment.reduce((s, d) => s + d.current_payroll, 0);
  const totalAdjusted = byDepartment.reduce((s, d) => s + d.adjusted_payroll, 0);

  return {
    adjustment_pct: adjustmentPct,
    total_current: totalCurrent,
    total_adjusted: totalAdjusted,
    total_delta: totalAdjusted - totalCurrent,
    by_department: byDepartment,
    by_employee: byEmployee,
  };
}
