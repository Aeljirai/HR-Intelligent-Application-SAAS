import { Router } from 'express';
import { z } from 'zod';
import { computeFlightRisk, computeFlightRiskCounterfactuals } from '../ml/flightRisk.js';
import { computeTurnoverRisk, computeTurnoverRiskBatch } from '../ml/turnoverModel.js';
import { analyzeSentiment, attemptTier0Resolution, decideRouting, detectCategory, detectUrgency } from '../ml/sentiment.js';
import { detectAttendanceAnomalies } from '../ml/anomalyDetection.js';
import { forecastHeadcount } from '../ml/headcountForecast.js';
import { buildOnaGraph } from '../ml/onaGraph.js';
import { computeSentimentPulse } from '../ml/sentimentPulse.js';
import { simulateCompensationChange } from '../ml/compensationSandbox.js';
import { optimizeShifts } from '../ml/shiftOptimizer.js';
import { computeDepartmentLoads, suggestReallocations } from '../ml/resourceReallocation.js';

export const mlRouter = Router();

/** Loosely-typed passthrough — this service trusts its caller (the backend, over
 *  the internal Docker network) to have already fetched/shaped the rows from
 *  Supabase; it only re-validates that the expected top-level fields exist. */
const employeeSchema = z.record(z.string(), z.any());

mlRouter.post('/flight-risk/compute', (req, res) => {
  const schema = z.object({
    employee: employeeSchema,
    overrides: z
      .object({
        overtimeHoursMonth: z.number().optional(),
        daysSinceVacation: z.number().optional(),
        salary: z.number().optional(),
      })
      .optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(computeFlightRisk(parsed.data.employee as any, parsed.data.overrides));
});

mlRouter.post('/flight-risk/compute-batch', (req, res) => {
  const schema = z.object({ employees: z.array(employeeSchema) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(parsed.data.employees.map((e) => computeFlightRisk(e as any)));
});

mlRouter.post('/flight-risk/counterfactuals', (req, res) => {
  const schema = z.object({
    employee: employeeSchema,
    bounds: z.object({
      overtimeHoursMonth: z.tuple([z.number(), z.number()]),
      daysSinceVacation: z.tuple([z.number(), z.number()]),
      salary: z.tuple([z.number(), z.number()]),
    }),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(computeFlightRiskCounterfactuals(parsed.data.employee as any, parsed.data.bounds));
});

const turnoverFeaturesSchema = z.object({
  satisfactionLevel: z.number(),
  lastEvaluation: z.number(),
  numberProject: z.number(),
  averageMonthlyHours: z.number(),
  timeSpendCompany: z.number(),
  workAccident: z.union([z.literal(0), z.literal(1)]),
  promotionLast5Years: z.union([z.literal(0), z.literal(1)]),
  department: z.string(),
  salaryBucket: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

mlRouter.post('/turnover-model/compute', (req, res) => {
  const schema = z.object({ employee_id: z.string(), features: turnoverFeaturesSchema });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(computeTurnoverRisk(parsed.data.employee_id, parsed.data.features as any));
});

mlRouter.post('/turnover-model/compute-batch', (req, res) => {
  const schema = z.object({
    items: z.array(z.object({ employee_id: z.string(), features: turnoverFeaturesSchema })),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(computeTurnoverRiskBatch(parsed.data.items as any));
});

mlRouter.post('/sentiment/analyze', (req, res) => {
  const schema = z.object({ text: z.string().min(1).max(4000), employee: employeeSchema.optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { text, employee } = parsed.data;
  const sentiment = analyzeSentiment(text);
  const urgency = detectUrgency(text);
  const category = detectCategory(text);
  const routing = decideRouting(urgency, sentiment, category);
  const tier0 = employee ? attemptTier0Resolution(text, employee as any) : { resolved: false as const };
  res.json({ sentiment, urgency, category, routing, tier0 });
});

mlRouter.post('/anomaly-detection', (req, res) => {
  const schema = z.object({ attendance: z.array(employeeSchema), employees: z.array(employeeSchema), departments: z.array(employeeSchema) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(detectAttendanceAnomalies(parsed.data.attendance as any, parsed.data.employees as any, parsed.data.departments as any));
});

mlRouter.post('/headcount-forecast', (req, res) => {
  const schema = z.object({ employees: z.array(employeeSchema), monthsAhead: z.number().min(1).max(24).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(forecastHeadcount(parsed.data.employees as any, parsed.data.monthsAhead));
});

mlRouter.post('/ona-graph', (req, res) => {
  const schema = z.object({ employees: z.array(employeeSchema), memberships: z.array(employeeSchema) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(buildOnaGraph(parsed.data.employees as any, parsed.data.memberships as any));
});

mlRouter.post('/sentiment-pulse', (req, res) => {
  const schema = z.object({
    employeeIds: z.array(z.string()),
    tickets: z.array(employeeSchema),
    graph: z.object({ nodes: z.array(employeeSchema), edges: z.array(employeeSchema) }),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(computeSentimentPulse(parsed.data.employeeIds, parsed.data.tickets as any, parsed.data.graph as any));
});

mlRouter.post('/compensation-sandbox', (req, res) => {
  const schema = z.object({
    employees: z.array(employeeSchema),
    departments: z.array(employeeSchema),
    adjustment_pct: z.number().min(-10).max(15),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(simulateCompensationChange(parsed.data.employees as any, parsed.data.departments as any, parsed.data.adjustment_pct));
});

mlRouter.post('/shift-optimizer', (req, res) => {
  const schema = z.object({
    attendance: z.array(employeeSchema),
    employees: z.array(employeeSchema),
    departmentId: z.string().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(optimizeShifts(parsed.data.attendance as any, parsed.data.employees as any, parsed.data.departmentId));
});

mlRouter.post('/resource-reallocation', (req, res) => {
  const schema = z.object({
    departments: z.array(employeeSchema),
    employees: z.array(employeeSchema),
    tickets: z.array(employeeSchema),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const loads = computeDepartmentLoads(parsed.data.departments as any, parsed.data.employees as any, parsed.data.tickets as any);
  res.json({ loads, suggestions: suggestReallocations(loads) });
});
