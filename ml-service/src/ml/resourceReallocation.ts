import { mean } from '../lib/stats.js';
import type { Department, Employee, Ticket } from '../types.js';

export interface ReallocationSuggestion {
  from_department_id: string;
  from_department_name: string;
  to_department_id: string;
  to_department_name: string;
  headcount_to_move: number;
  urgency: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface DepartmentLoad {
  department_id: string;
  department_name: string;
  headcount: number;
  open_tickets: number;
  tickets_per_employee: number;
  load_index: number; // vs. company average, 1.0 = average
}

export function computeDepartmentLoads(
  departments: Department[],
  employees: Employee[],
  tickets: Ticket[]
): DepartmentLoad[] {
  const activeEmployees = employees.filter((e) => e.status === 'active');
  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'escalated');
  const empDept = new Map(activeEmployees.map((e) => [e.id, e.department_id]));

  const loads: DepartmentLoad[] = departments.map((dept) => {
    const headcount = activeEmployees.filter((e) => e.department_id === dept.id).length;
    const openForDept = openTickets.filter((t) => empDept.get(t.employee_id) === dept.id).length;
    return {
      department_id: dept.id,
      department_name: dept.name,
      headcount,
      open_tickets: openForDept,
      tickets_per_employee: headcount > 0 ? openForDept / headcount : 0,
      load_index: 0,
    };
  });

  const avgRatio = mean(loads.map((l) => l.tickets_per_employee)) || 1;
  for (const l of loads) {
    l.load_index = avgRatio > 0 ? Math.round((l.tickets_per_employee / avgRatio) * 100) / 100 : 1;
  }
  return loads.sort((a, b) => b.load_index - a.load_index);
}

/**
 * Pairs the most overloaded departments with the most underloaded ones and
 * proposes a small headcount transfer sized to close roughly half the gap —
 * a conservative simulation of a resourcing rebalance, not a hard mandate.
 */
export function suggestReallocations(loads: DepartmentLoad[]): ReallocationSuggestion[] {
  const overloaded = loads.filter((l) => l.load_index >= 1.3).sort((a, b) => b.load_index - a.load_index);
  const underloaded = [...loads].filter((l) => l.load_index <= 0.7).sort((a, b) => a.load_index - b.load_index);

  const suggestions: ReallocationSuggestion[] = [];
  const usedUnderloaded = new Set<string>();

  for (const over of overloaded) {
    const under = underloaded.find((u) => !usedUnderloaded.has(u.department_id));
    if (!under) continue;
    usedUnderloaded.add(under.department_id);

    const headcountToMove = Math.max(1, Math.round(Math.min(over.headcount, under.headcount) * 0.15));
    const urgency: ReallocationSuggestion['urgency'] =
      over.load_index >= 2 ? 'high' : over.load_index >= 1.6 ? 'medium' : 'low';

    suggestions.push({
      from_department_id: under.department_id,
      from_department_name: under.department_name,
      to_department_id: over.department_id,
      to_department_name: over.department_name,
      headcount_to_move: headcountToMove,
      urgency,
      rationale: `${over.department_name} is running ${over.load_index.toFixed(1)}x the average ticket load per employee (${over.open_tickets} open tickets across ${over.headcount} people), while ${under.department_name} is at ${under.load_index.toFixed(1)}x.`,
    });
  }

  return suggestions;
}
