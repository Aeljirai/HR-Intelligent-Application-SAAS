-- =====================================================================
-- Daily Work Log: employee self-reported daily work status, hours, and
-- project-time allocation. One row per (employee, date) — resubmitting
-- the same day upserts it (on_conflict employee_id,log_date). Feeds an
-- admin/manager rollup of who worked, regular vs. overtime hours, and
-- which projects the day was split across.
-- =====================================================================

do $$ begin
  create type daily_work_leave_reason as enum ('sick', 'vacation', 'unpaid', 'other');
exception when duplicate_object then null; end $$;

create table if not exists daily_work_logs (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  log_date date not null,
  worked boolean not null default true,
  leave_reason daily_work_leave_reason,
  standard_hours numeric(4,1) not null default 0,
  overtime_hours numeric(4,1) not null default 0,
  -- [{ "project_id": "...", "project_name": "...", "percent": 60, "hours": 4.8 }, ...]
  allocations jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, log_date),
  constraint daily_work_logs_leave_reason_check check (
    (worked = true and leave_reason is null) or (worked = false and leave_reason is not null)
  )
);

create index if not exists idx_daily_work_logs_employee on daily_work_logs(employee_id);
create index if not exists idx_daily_work_logs_date on daily_work_logs(log_date);

alter table daily_work_logs enable row level security;

-- visibility: HR staff (admin + manager) see every row, same breadth as
-- attendance/tickets; an employee sees + writes only their own rows.
create policy daily_work_logs_select on daily_work_logs for select
  using (is_hr_staff() or employee_id = my_employee_id());
create policy daily_work_logs_insert on daily_work_logs for insert
  with check (employee_id = my_employee_id());
create policy daily_work_logs_update on daily_work_logs for update
  using (employee_id = my_employee_id())
  with check (employee_id = my_employee_id());
