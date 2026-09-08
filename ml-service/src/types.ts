/**
 * Minimal data shapes this service needs to compute against. Deliberately a
 * standalone copy rather than a shared package — this service only ever
 * receives already-fetched rows in a request body (see backend's
 * lib/mlClient.ts), never touches Supabase itself, so it doesn't need the
 * full app type surface.
 */

export type Seniority = 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';

export interface Department {
  id: string;
  name: string;
  region: string;
  budget: number;
  kpi_completion: number;
  output_score: number;
  manager_employee_id: string | null;
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
  region: string;
  lat: number | null;
  lng: number | null;
  overtime_hours_month: number;
  days_since_vacation: number;
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

export type TicketCategory = 'pto' | 'benefits' | 'payroll' | 'it' | 'facilities' | 'conduct' | 'other';
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

export interface ProjectMember {
  id: string;
  project_id: string;
  employee_id: string;
  role_on_project: string;
}
