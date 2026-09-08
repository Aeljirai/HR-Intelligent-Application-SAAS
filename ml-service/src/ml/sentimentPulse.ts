import type { OnaGraph } from './onaGraph.js';

export interface PulseNode {
  employee_id: string;
  personal_sentiment: number; // mean of own tickets' sentiment_score, -1..1
  pulse: number; // blended with neighbors' personal sentiment, -1..1
  ticket_count: number;
}

const OWN_WEIGHT = 0.6;
const NEIGHBOR_WEIGHT = 0.4;

/**
 * Blends each employee's own ticket sentiment with their ONA neighbors' —
 * a single diffusion round, not an iterative/convergent simulation, kept
 * deliberately simple and explainable to match this service's other
 * hand-rolled algorithms. An employee with zero tickets defaults to 0
 * (neutral) — "no data" is treated as no signal, not assumed unhappiness.
 * Isolated nodes (no ONA edges) keep their personal sentiment unchanged —
 * there's no neighbor average to blend in, so diluting toward 0 would be
 * a bug, not a feature.
 */
export function computeSentimentPulse(
  employeeIds: string[],
  tickets: { employee_id: string; sentiment_score: number | null }[],
  graph: OnaGraph
): PulseNode[] {
  const idSet = new Set(employeeIds);

  const sentimentSums = new Map<string, { sum: number; count: number }>();
  for (const t of tickets) {
    if (!idSet.has(t.employee_id) || t.sentiment_score == null) continue;
    const entry = sentimentSums.get(t.employee_id) ?? { sum: 0, count: 0 };
    entry.sum += t.sentiment_score;
    entry.count += 1;
    sentimentSums.set(t.employee_id, entry);
  }

  const personalById = new Map<string, number>();
  const ticketCountById = new Map<string, number>();
  for (const id of employeeIds) {
    const entry = sentimentSums.get(id);
    personalById.set(id, entry ? entry.sum / entry.count : 0);
    ticketCountById.set(id, entry?.count ?? 0);
  }

  const neighbors = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (idSet.has(edge.source) && idSet.has(edge.target)) {
      (neighbors.get(edge.source) ?? neighbors.set(edge.source, []).get(edge.source)!).push(edge.target);
      (neighbors.get(edge.target) ?? neighbors.set(edge.target, []).get(edge.target)!).push(edge.source);
    }
  }

  return employeeIds.map((id) => {
    const personal = personalById.get(id)!;
    const neighborIds = neighbors.get(id) ?? [];
    const pulse =
      neighborIds.length === 0
        ? personal
        : OWN_WEIGHT * personal +
          NEIGHBOR_WEIGHT * (neighborIds.reduce((sum, n) => sum + (personalById.get(n) ?? 0), 0) / neighborIds.length);

    return {
      employee_id: id,
      personal_sentiment: Math.round(personal * 1000) / 1000,
      pulse: Math.round(pulse * 1000) / 1000,
      ticket_count: ticketCountById.get(id) ?? 0,
    };
  });
}
