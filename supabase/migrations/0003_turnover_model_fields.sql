-- =====================================================================
-- Add turnover-model input fields to employees (satisfaction_level,
-- work_accident, promotion_last_5years) — feeds the hand-rolled Random
-- Forest turnover-risk signal (see ml-service/src/ml/turnoverModel.ts),
-- ported from the Kaggle notebook dalekube/employee-flight-risk-model.
-- Added alongside the existing flight-risk feature, not replacing it.
-- =====================================================================

alter table employees
  add column if not exists satisfaction_level numeric(4,3) not null default 0.600;

alter table employees
  add column if not exists work_accident boolean not null default false;

alter table employees
  add column if not exists promotion_last_5years boolean not null default false;
