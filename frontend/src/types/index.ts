export type AppRole = 'admin' | 'manager' | 'employee';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  department_id: string | null;
  avatar_url: string | null;
}

export type Seniority = 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';
export type ContractType = 'full_time' | 'part_time' | 'contract' | 'intern';

export interface Department {
  id: string;
  name: string;
  region: string;
  budget: number;
  kpi_completion: number;
  output_score: number;
  manager_employee_id: string | null;
}

export interface EmployeeSkill {
  id: string;
  employee_id: string;
  skill_name: string;
  proficiency: number;
}

export interface FlightRiskFactor {
  factor: string;
  label: string;
  impact: number;
  detail: string;
}

export interface FlightRiskResult {
  employee_id: string;
  score: number;
  band: 'low' | 'moderate' | 'high' | 'severe';
  factors: FlightRiskFactor[];
}

export interface Employee {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string;
  department_id: string | null;
  job_title: string;
  seniority: Seniority;
  hire_date: string;
  termination_date: string | null;
  salary: number;
  market_salary: number;
  performance_score: number;
  pto_balance: number;
  pto_used_ytd: number;
  manager_id: string | null;
  status: EmployeeStatus;
  contract_type: ContractType;
  region: string;
  lat: number | null;
  lng: number | null;
  overtime_hours_month: number;
  days_since_vacation: number;
  satisfaction_level: number;
  work_accident: boolean;
  promotion_last_5years: boolean;
  skills?: EmployeeSkill[];
  flight_risk?: FlightRiskResult;
  turnover_model?: TurnoverRiskResult;
}

export interface FlightRiskLeverSuggestion {
  lever: 'overtimeHoursMonth' | 'daysSinceVacation' | 'salary';
  currentValue: number;
  suggestedValue: number | null;
  achievesBand: FlightRiskResult['band'] | null;
  bounds: [number, number];
}
export interface FlightRiskCounterfactuals {
  employee_id: string;
  currentBand: FlightRiskResult['band'];
  suggestions: FlightRiskLeverSuggestion[];
}

export interface TurnoverRiskResult {
  employee_id: string;
  probability: number;
  band: 'low' | 'moderate' | 'high' | 'severe';
  feature_importance: { feature: string; importance_pct: number }[];
}

export type AttendanceStatus = 'present' | 'remote' | 'late' | 'absent' | 'pto';

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  hours_worked: number;
}

export type TicketCategory =
  | 'pto'
  | 'benefits'
  | 'payroll'
  | 'it'
  | 'facilities'
  | 'conduct'
  | 'other';
export type TicketUrgency = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in_progress' | 'escalated' | 'resolved' | 'auto_resolved';

export interface Ticket {
  id: string;
  employee_id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  sentiment_label: 'positive' | 'neutral' | 'negative' | null;
  sentiment_score: number | null;
  urgency: TicketUrgency;
  status: TicketStatus;
  tier0_resolved: boolean;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AttendanceAnomaly {
  department_id: string;
  department_name: string;
  window_start: string;
  window_end: string;
  metric: 'absenteeism' | 'late_arrivals';
  rate: number;
  baseline_rate: number;
  z_score: number;
  severity: 'watch' | 'warning' | 'critical';
}

export interface HeadcountPoint {
  month: string;
  actual: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
}

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
  weight: number;
}

export interface PulseNode {
  employee_id: string;
  personal_sentiment: number;
  pulse: number;
  ticket_count: number;
}

export interface OnaGraph {
  nodes: OnaNode[];
  edges: OnaEdge[];
  pulse?: PulseNode[];
}

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

export interface ShiftWindow {
  name: string;
  start: string;
  end: string;
  recommended_headcount: number;
  current_avg_headcount: number;
  is_peak: boolean;
}

export interface ShiftPlan {
  department_id: string | null;
  windows: ShiftWindow[];
  peak_hour: number;
}

export interface DepartmentLoad {
  department_id: string;
  department_name: string;
  headcount: number;
  open_tickets: number;
  tickets_per_employee: number;
  load_index: number;
}

export interface ReallocationSuggestion {
  from_department_id: string;
  from_department_name: string;
  to_department_id: string;
  to_department_name: string;
  headcount_to_move: number;
  urgency: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface GeoSummary {
  region: string;
  lat: number;
  lng: number;
  headcount: number;
  active: number;
}

export interface DepartmentHeatmapEntry {
  department_id: string;
  department_name: string;
  budget: number;
  payroll: number;
  utilization_pct: number;
  kpi_completion: number;
  output_score: number;
  efficiency_score: number;
  headcount: number;
}

export type WellbeingRequestType = 'club_join' | 'psychiatric_support';
export type WellbeingRequestStatus = 'pending' | 'approved' | 'declined' | 'scheduled';

export interface WellbeingClub {
  id: string;
  name: string;
  description: string;
  category: string;
  meeting_schedule: string | null;
}

export interface WellbeingRequest {
  id: string;
  employee_id: string;
  type: WellbeingRequestType;
  club_id: string | null;
  note: string | null;
  status: WellbeingRequestStatus;
  scheduled_at: string | null;
  reviewed_by: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
  employee: { id: string; full_name: string; job_title: string; department_id: string | null } | null;
  club: { id: string; name: string } | null;
}

export interface TwinMember {
  employee_id: string;
  full_name: string;
  job_title: string;
  department_id: string | null;
  seniority: Seniority;
  proficiency: number;
  projects: { id: string; name: string; status: string }[];
}

export interface TwinGroup {
  skill: string;
  members: TwinMember[];
  distinct_project_count: number;
  cross_project_pairs: number;
}

export interface TwinEmployeesResult {
  groups: TwinGroup[];
  total_groups_found: number;
  generated_at: string;
}

export interface AgentCommand {
  intent: 'execute' | 'synthesize' | 'query';
  action: string;
  entities: Record<string, string>;
  confidence: number;
  raw_text: string;
}

export interface AgentResult {
  kind: 'action_confirmation' | 'chart' | 'text';
  message: string;
  payload?: unknown;
}

export interface Project {
  id: string;
  name: string;
  department_id: string | null;
  status: 'planned' | 'active' | 'completed' | 'on_hold';
  start_date: string;
  end_date: string | null;
}

export type LeaveReason = 'sick' | 'vacation' | 'unpaid' | 'other';

export interface ProjectAllocation {
  project_id: string;
  project_name: string;
  percent: number;
  hours: number;
}

export interface DailyWorkLog {
  id: string;
  employee_id: string;
  log_date: string;
  worked: boolean;
  leave_reason: LeaveReason | null;
  standard_hours: number;
  overtime_hours: number;
  allocations: ProjectAllocation[];
  created_at: string;
  updated_at: string;
  employee?: { id: string; full_name: string; department_id: string | null } | null;
}

export interface CreateDailyWorkLogPayload {
  log_date: string;
  worked: boolean;
  leave_reason: LeaveReason | null;
  standard_hours: number;
  overtime_hours: number;
  allocations: ProjectAllocation[];
}
