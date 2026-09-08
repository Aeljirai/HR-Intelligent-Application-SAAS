/**
 * Offline trainer for the turnover-risk Random Forest, ported from the
 * Kaggle notebook dalekube/employee-flight-risk-model. Trains a genuine
 * bagged-CART ensemble (Gini-impurity splits, bootstrap sampling, random
 * feature subset per split) on the public HR_comma_sep.csv dataset and
 * writes the serialized forest to src/ml/turnoverForest.json.
 *
 * This is a manual, occasional step — like backend/scripts/seed.ts — never
 * run at container start or from the Dockerfile. Re-run only if the
 * training data or hyperparameters change:
 *
 *   bun run train:turnover-model   (from ml-service/)
 *
 * Dataset source: https://www.kaggle.com/datasets/liujiaqi/hr-comma-sepcsv
 * (CC0: Public Domain), ~14,999 rows, predicting voluntary attrition.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FEATURE_NAMES,
  KAGGLE_DEPARTMENTS,
  toFeatureVector,
  type KaggleDepartment,
  type TurnoverRiskInput,
} from '../src/ml/turnoverFeatureSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- deterministic PRNG (same LCG style as backend/scripts/seed.ts, so a
// re-run reproduces a byte-identical artifact for review) ----------------
let seedState = 42;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// ---- load + parse the CSV (no quoted fields in this dataset, plain split
// is safe) -----------------------------------------------------------------
const CSV_PATH = path.join(__dirname, '../data/HR_comma_sep.csv');
const lines = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n');
const dataLines = lines.slice(1); // drop header

const SALARY_BUCKET: Record<string, 0 | 1 | 2> = { low: 0, medium: 1, high: 2 };

const rows = dataLines.map((line) => {
  const c = line.split(',');
  const input: TurnoverRiskInput = {
    satisfactionLevel: Number(c[0]),
    lastEvaluation: Number(c[1]),
    numberProject: Number(c[2]),
    averageMonthlyHours: Number(c[3]),
    timeSpendCompany: Number(c[4]),
    workAccident: Number(c[5]) as 0 | 1,
    promotionLast5Years: Number(c[7]) as 0 | 1,
    department: c[8] as KaggleDepartment,
    salaryBucket: SALARY_BUCKET[c[9]!] ?? 1,
  };
  return { input, left: Number(c[6]) };
});

const X = rows.map((r) => toFeatureVector(r.input));
const y = rows.map((r) => r.left);
const N_FEATURES = FEATURE_NAMES.length;
const CATEGORICAL_FEATURE = FEATURE_NAMES.indexOf('department');

console.log(`Loaded ${rows.length} rows from ${CSV_PATH}`);
console.log(`Departments seen: ${new Set(rows.map((r) => r.input.department)).size} / ${KAGGLE_DEPARTMENTS.length}`);

// ---- CART + bagging -------------------------------------------------------
type Leaf = { t: 0; n: number; pos: number; p: number };
type NumSplit = { t: 1; f: number; th: number; l: ForestNode; r: ForestNode };
type CatSplit = { t: 2; f: number; mask: number; l: ForestNode; r: ForestNode };
type ForestNode = Leaf | NumSplit | CatSplit;

const N_TREES = 200;
const MTRY = 4;
const MAX_DEPTH = 12;
const MIN_SAMPLES_SPLIT = 20;
const MIN_SAMPLES_LEAF = 10;

const featureImportance = new Array(N_FEATURES).fill(0);

function gini(pos: number, n: number): number {
  if (n === 0) return 0;
  const p = pos / n;
  return 1 - p * p - (1 - p) * (1 - p);
}

function makeLeaf(indices: number[]): Leaf {
  const n = indices.length;
  const pos = indices.reduce((s, i) => s + y[i]!, 0);
  return { t: 0, n, pos, p: n ? pos / n : 0 };
}

function pickFeatureSubset(): number[] {
  const pool = Array.from({ length: N_FEATURES }, (_, i) => i);
  const chosen: number[] = [];
  while (chosen.length < MTRY && pool.length) {
    const idx = randInt(0, pool.length - 1);
    chosen.push(pool.splice(idx, 1)[0]!);
  }
  return chosen;
}

interface SplitCandidate {
  feature: number;
  gain: number;
  isCategory: boolean;
  threshold?: number;
  mask?: number;
  leftIdx: number[];
  rightIdx: number[];
}

function splitGain(leftIdx: number[], rightIdx: number[], parentGini: number, n: number): number {
  const leftPos = leftIdx.reduce((s, i) => s + y[i]!, 0);
  const rightPos = rightIdx.reduce((s, i) => s + y[i]!, 0);
  const leftGini = gini(leftPos, leftIdx.length);
  const rightGini = gini(rightPos, rightIdx.length);
  const weighted = (leftIdx.length / n) * leftGini + (rightIdx.length / n) * rightGini;
  return parentGini - weighted;
}

function bestSplitForFeature(
  indices: number[],
  feature: number,
  parentGini: number,
  n: number
): SplitCandidate | null {
  if (feature === CATEGORICAL_FEATURE) {
    // Unordered categorical (department, <=10 levels actually present at
    // this node): exhaustive subset-partition search, same as CART/
    // randomForest use for unordered factors with <=32 levels.
    const present = Array.from(new Set(indices.map((i) => X[i]![feature]!)));
    const k = present.length;
    if (k < 2) return null;
    let best: SplitCandidate | null = null;
    const subsetCount = 1 << k;
    for (let subset = 1; subset < subsetCount - 1; subset++) {
      const complement = subsetCount - 1 - subset;
      if (subset > complement) continue; // skip mirrored duplicate partitions
      let mask = 0;
      for (let b = 0; b < k; b++) if (subset & (1 << b)) mask |= 1 << present[b]!;
      const leftIdx: number[] = [];
      const rightIdx: number[] = [];
      for (const i of indices) {
        if (mask & (1 << X[i]![feature]!)) leftIdx.push(i);
        else rightIdx.push(i);
      }
      if (leftIdx.length < MIN_SAMPLES_LEAF || rightIdx.length < MIN_SAMPLES_LEAF) continue;
      const gain = splitGain(leftIdx, rightIdx, parentGini, n);
      if (gain > 0 && (!best || gain > best.gain)) {
        best = { feature, gain, isCategory: true, mask, leftIdx, rightIdx };
      }
    }
    return best;
  }

  // Numeric / ordinal / boolean: exhaustive threshold search over sorted
  // midpoints between distinct values present at this node.
  const values = Array.from(new Set(indices.map((i) => X[i]![feature]!))).sort((a, b) => a - b);
  if (values.length < 2) return null;
  let best: SplitCandidate | null = null;
  for (let vi = 0; vi < values.length - 1; vi++) {
    const threshold = (values[vi]! + values[vi + 1]!) / 2;
    const leftIdx: number[] = [];
    const rightIdx: number[] = [];
    for (const i of indices) {
      if (X[i]![feature]! <= threshold) leftIdx.push(i);
      else rightIdx.push(i);
    }
    if (leftIdx.length < MIN_SAMPLES_LEAF || rightIdx.length < MIN_SAMPLES_LEAF) continue;
    const gain = splitGain(leftIdx, rightIdx, parentGini, n);
    if (gain > 0 && (!best || gain > best.gain)) {
      best = { feature, gain, isCategory: false, threshold, leftIdx, rightIdx };
    }
  }
  return best;
}

function buildTree(indices: number[], depth: number): ForestNode {
  const n = indices.length;
  const pos = indices.reduce((s, i) => s + y[i]!, 0);
  if (depth >= MAX_DEPTH || n < MIN_SAMPLES_SPLIT || pos === 0 || pos === n) {
    return makeLeaf(indices);
  }

  const parentGini = gini(pos, n);
  const candidateFeatures = pickFeatureSubset();
  let best: SplitCandidate | null = null;
  for (const f of candidateFeatures) {
    const candidate = bestSplitForFeature(indices, f, parentGini, n);
    if (candidate && (!best || candidate.gain > best.gain)) best = candidate;
  }
  if (!best) return makeLeaf(indices);

  featureImportance[best.feature]! += best.gain * n;

  const left = buildTree(best.leftIdx, depth + 1);
  const right = buildTree(best.rightIdx, depth + 1);
  return best.isCategory
    ? { t: 2, f: best.feature, mask: best.mask!, l: left, r: right }
    : { t: 1, f: best.feature, th: best.threshold!, l: left, r: right };
}

/** Balanced-bootstrap: equal-sized with-replacement draws from each class,
 * to combat the ~24%/76% class imbalance without threading per-sample
 * weights through every Gini calculation. */
function balancedBootstrap(allIndices: number[]): number[] {
  const positives = allIndices.filter((i) => y[i] === 1);
  const negatives = allIndices.filter((i) => y[i] === 0);
  const nMinority = Math.min(positives.length, negatives.length);
  const sample: number[] = [];
  for (let k = 0; k < nMinority; k++) sample.push(positives[randInt(0, positives.length - 1)]!);
  for (let k = 0; k < nMinority; k++) sample.push(negatives[randInt(0, negatives.length - 1)]!);
  return sample;
}

function trainForest(allIndices: number[], nTrees: number): ForestNode[] {
  const trees: ForestNode[] = [];
  for (let t = 0; t < nTrees; t++) {
    trees.push(buildTree(balancedBootstrap(allIndices), 0));
    if ((t + 1) % 50 === 0) console.log(`  tree ${t + 1}/${nTrees}`);
  }
  return trees;
}

function predictProba(node: ForestNode, features: number[]): number {
  if (node.t === 0) return node.p;
  if (node.t === 1) {
    return features[node.f]! <= node.th ? predictProba(node.l, features) : predictProba(node.r, features);
  }
  return (node.mask & (1 << features[node.f]!)) !== 0
    ? predictProba(node.l, features)
    : predictProba(node.r, features);
}

function forestPredict(forest: ForestNode[], features: number[]): number {
  const sum = forest.reduce((s, tree) => s + predictProba(tree, features), 0);
  return sum / forest.length;
}

// ---- 1. Evaluation pass: 80/20 holdout, just for a printed sanity metric --
const allIdx = Array.from({ length: X.length }, (_, i) => i);
for (let i = allIdx.length - 1; i > 0; i--) {
  const j = randInt(0, i);
  [allIdx[i], allIdx[j]] = [allIdx[j]!, allIdx[i]!];
}
const splitPoint = Math.floor(allIdx.length * 0.8);
const trainIdx = allIdx.slice(0, splitPoint);
const holdoutIdx = allIdx.slice(splitPoint);

console.log(`\nTraining evaluation forest on ${trainIdx.length} rows, holding out ${holdoutIdx.length}...`);
const evalForest = trainForest(trainIdx, N_TREES);
let correct = 0;
for (const i of holdoutIdx) {
  const predicted = forestPredict(evalForest, X[i]!) >= 0.5 ? 1 : 0;
  if (predicted === y[i]) correct++;
}
const holdoutAccuracyPct = (correct / holdoutIdx.length) * 100;
console.log(`Holdout accuracy: ${holdoutAccuracyPct.toFixed(2)}%`);

// ---- 2. Final forest: trained on the full dataset, this is what ships ----
console.log(`\nTraining final forest on all ${X.length} rows...`);
featureImportance.fill(0); // only the final forest's importance is shipped
const finalForest = trainForest(allIdx, N_TREES);

const totalImportance = featureImportance.reduce((s, v) => s + v, 0) || 1;
const featureImportanceOut = FEATURE_NAMES.map((name, i) => ({
  feature: name,
  importance_pct: Math.round((featureImportance[i]! / totalImportance) * 1000) / 10,
})).sort((a, b) => b.importance_pct - a.importance_pct);

console.log('\nFeature importance:');
for (const f of featureImportanceOut) console.log(`  ${f.feature}: ${f.importance_pct}%`);

const basePositiveRate = (y.reduce((s, v) => s + v, 0) / y.length) * 100;

const artifact = {
  version: 1,
  trainedAt: new Date().toISOString(),
  featureNames: FEATURE_NAMES,
  kaggleDepartments: KAGGLE_DEPARTMENTS,
  trees: finalForest,
  featureImportance: featureImportanceOut,
  meta: {
    nTrees: N_TREES,
    maxDepth: MAX_DEPTH,
    mtry: MTRY,
    trainingRows: X.length,
    baseRatePct: Math.round(basePositiveRate * 10) / 10,
    holdoutAccuracyPct: Math.round(holdoutAccuracyPct * 10) / 10,
  },
};

const OUT_PATH = path.join(__dirname, '../src/ml/turnoverForest.json');
fs.writeFileSync(OUT_PATH, JSON.stringify(artifact));
console.log(`\nWrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(2)} MB)`);
