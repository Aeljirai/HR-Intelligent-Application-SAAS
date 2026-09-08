import type { Employee, ProjectMember } from '../types.js';

export interface OnaNode {
  id: string;
  full_name: string;
  department_id: string | null;
  degree: number;
  cross_department_links: number;
  role: 'bridge' | 'isolated' | 'core' | 'standard';
}

export interface OnaEdge {
  source: string;
  target: string;
  weight: number; // number of shared projects
}

export interface OnaGraph {
  nodes: OnaNode[];
  edges: OnaEdge[];
}

/**
 * Builds a lightweight organizational network graph from shared project
 * membership: two employees get an edge (weighted by co-occurrence count)
 * whenever they've worked the same project. Bridge employees are the ones
 * whose links span multiple departments — they're the informal glue between
 * teams; isolated employees have 0-1 links total.
 */
export function buildOnaGraph(employees: Employee[], memberships: ProjectMember[]): OnaGraph {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const byProject = new Map<string, string[]>();
  for (const m of memberships) {
    if (!employeeById.has(m.employee_id)) continue;
    (byProject.get(m.project_id) ?? byProject.set(m.project_id, []).get(m.project_id)!).push(
      m.employee_id
    );
  }

  const edgeWeights = new Map<string, number>();
  for (const members of byProject.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = pairKey(members[i]!, members[j]!);
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
      }
    }
  }

  const edges: OnaEdge[] = Array.from(edgeWeights.entries()).map(([key, weight]) => {
    const [source, target] = key.split('|');
    return { source: source!, target: target!, weight };
  });

  const degree = new Map<string, number>();
  const crossDeptLinks = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    const a = employeeById.get(edge.source);
    const b = employeeById.get(edge.target);
    if (a && b && a.department_id !== b.department_id) {
      crossDeptLinks.set(edge.source, (crossDeptLinks.get(edge.source) ?? 0) + 1);
      crossDeptLinks.set(edge.target, (crossDeptLinks.get(edge.target) ?? 0) + 1);
    }
  }

  const degrees = employees.map((e) => degree.get(e.id) ?? 0);
  const avgDegree = degrees.length ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;

  const nodes: OnaNode[] = employees.map((e) => {
    const d = degree.get(e.id) ?? 0;
    const cross = crossDeptLinks.get(e.id) ?? 0;
    let role: OnaNode['role'] = 'standard';
    if (d <= 1) role = 'isolated';
    else if (cross >= 1) role = 'bridge'; // touches more than one department's cluster
    else if (d >= avgDegree * 1.5) role = 'core';

    return {
      id: e.id,
      full_name: e.full_name,
      department_id: e.department_id,
      degree: d,
      cross_department_links: cross,
      role,
    };
  });

  return { nodes, edges };
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
