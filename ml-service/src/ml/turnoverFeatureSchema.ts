/**
 * Shared feature schema for the turnover-risk Random Forest (ported from
 * the Kaggle notebook dalekube/employee-flight-risk-model). Used by both
 * the offline trainer (scripts/train-turnover-model.ts) and the runtime
 * inference module (turnoverModel.ts) — kept separate from turnoverModel.ts
 * so the trainer doesn't have to import the not-yet-generated forest JSON.
 */

// Fixed ordering from the training dataset (HR_comma_sep.csv) — index
// position is baked into every serialized tree's categorical split masks.
// Do not reorder without retraining.
export const KAGGLE_DEPARTMENTS = [
  'sales',
  'technical',
  'support',
  'IT',
  'product_mng',
  'marketing',
  'RandD',
  'accounting',
  'hr',
  'management',
] as const;

export type KaggleDepartment = (typeof KAGGLE_DEPARTMENTS)[number];

// Index-aligned with each tree's feature index (0-8).
export const FEATURE_NAMES = [
  'satisfaction_level',
  'last_evaluation',
  'number_project',
  'average_monthly_hours',
  'time_spend_company',
  'work_accident',
  'promotion_last_5years',
  'department',
  'salary',
] as const;

export interface TurnoverRiskInput {
  satisfactionLevel: number;
  lastEvaluation: number;
  numberProject: number;
  averageMonthlyHours: number;
  timeSpendCompany: number;
  workAccident: 0 | 1;
  promotionLast5Years: 0 | 1;
  department: KaggleDepartment;
  salaryBucket: 0 | 1 | 2;
}

/** The exact encoding used both to build training feature vectors and to
 * featurize a live employee at inference time — keeping this in one place
 * guarantees the two stay consistent. */
export function toFeatureVector(input: TurnoverRiskInput): number[] {
  const deptIdx = KAGGLE_DEPARTMENTS.indexOf(input.department);
  return [
    input.satisfactionLevel,
    input.lastEvaluation,
    input.numberProject,
    input.averageMonthlyHours,
    input.timeSpendCompany,
    input.workAccident,
    input.promotionLast5Years,
    deptIdx < 0 ? KAGGLE_DEPARTMENTS.length - 1 : deptIdx,
    input.salaryBucket,
  ];
}
