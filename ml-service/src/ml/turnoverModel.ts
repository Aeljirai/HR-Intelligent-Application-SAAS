import forest from './turnoverForest.json';
import { toFeatureVector, type TurnoverRiskInput } from './turnoverFeatureSchema.js';

export type { TurnoverRiskInput };

export interface TurnoverRiskResult {
  employee_id: string;
  probability: number; // 0-1, higher = more likely to leave
  band: 'low' | 'moderate' | 'high' | 'severe';
  feature_importance: { feature: string; importance_pct: number }[];
}

type ForestNode =
  | { t: 0; n: number; pos: number; p: number }
  | { t: 1; f: number; th: number; l: ForestNode; r: ForestNode }
  | { t: 2; f: number; mask: number; l: ForestNode; r: ForestNode };

const trees = forest.trees as unknown as ForestNode[];
const featureImportance = forest.featureImportance as { feature: string; importance_pct: number }[];

function predictProba(node: ForestNode, features: number[]): number {
  if (node.t === 0) return node.p;
  if (node.t === 1) {
    return features[node.f]! <= node.th ? predictProba(node.l, features) : predictProba(node.r, features);
  }
  return (node.mask & (1 << features[node.f]!)) !== 0
    ? predictProba(node.l, features)
    : predictProba(node.r, features);
}

/**
 * Hand-rolled Random Forest ported from the Kaggle notebook
 * dalekube/employee-flight-risk-model — trained offline once (see
 * scripts/train-turnover-model.ts) on the public HR_comma_sep.csv dataset
 * (CC0), never retrained at runtime. That dataset is a different
 * population than this app's own seeded employees, so treat the
 * probability as illustrative/demo-quality rather than a validated
 * prediction for this specific org. This is a complement to, not a
 * replacement for, the existing explainable flightRisk.ts score — that one
 * stays the source of per-employee "why" factors and drives the What-If
 * Simulator; this one only adds a second, independently-trained signal.
 */
export function computeTurnoverRisk(employeeId: string, input: TurnoverRiskInput): TurnoverRiskResult {
  const features = toFeatureVector(input);
  const sum = trees.reduce((s, tree) => s + predictProba(tree, features), 0);
  const probability = Math.round((sum / trees.length) * 1000) / 1000;
  const band: TurnoverRiskResult['band'] =
    probability >= 0.7 ? 'severe' : probability >= 0.5 ? 'high' : probability >= 0.3 ? 'moderate' : 'low';
  return { employee_id: employeeId, probability, band, feature_importance: featureImportance };
}

export function computeTurnoverRiskBatch(
  items: { employee_id: string; features: TurnoverRiskInput }[]
): TurnoverRiskResult[] {
  return items.map((item) => computeTurnoverRisk(item.employee_id, item.features));
}
