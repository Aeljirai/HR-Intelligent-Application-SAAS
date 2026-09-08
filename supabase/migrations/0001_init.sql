-- =====================================================================
-- HR Intelligence System — Initial Schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin', 'manager', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type employee_status as enum ('active', 'on_leave', 'terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type seniority_level as enum ('junior', 'mid', 'senior', 'lead', 'principal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present', 'remote', 'late', 'absent', 'pto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_category as enum ('pto', 'benefits', 'payroll', 'it', 'facilities', 'conduct', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_urgency as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open', 'in_progress', 'escalated', 'resolved', 'auto_resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_status as enum ('planned', 'active', 'completed', 'on_hold');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- DEPARTMENTS
-- ---------------------------------------------------------------------
create table if not exists departments (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  region text not null default 'HQ',
  budget numeric(14,2) not null default 0,
  kpi_completion numeric(5,2) not null default 0,   -- 0-100
  output_score numeric(5,2) not null default 0,     -- 0-100
  manager_employee_id uuid,                          -- fk added after employees exists
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PROFILES (extends auth.users — created by trigger on signup)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role app_role not null default 'employee',
  department_id uuid references departments(id) on delete set null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- EMPLOYEES (HR record; linked 1:1 to a profile once they have a login)
-- ---------------------------------------------------------------------
create table if not exists employees (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null,
  email text not null unique,
  department_id uuid references departments(id) on delete set null,
  job_title text not null,
  seniority seniority_level not null default 'mid',
  hire_date date not null,
  termination_date date,
  salary numeric(12,2) not null,
  market_salary numeric(12,2) not null,
  performance_score numeric(5,2) not null default 75,  -- 0-100
  pto_balance numeric(5,1) not null default 15,
  pto_used_ytd numeric(5,1) not null default 0,
  manager_id uuid references employees(id) on delete set null,
  status employee_status not null default 'active',
  region text not null default 'Remote',
  lat numeric(9,6),
  lng numeric(9,6),
  overtime_hours_month numeric(6,1) not null default 0,
  days_since_vacation integer not null default 0,
  created_at timestamptz not null default now()
);

alter table departments
  add constraint departments_manager_fk
  foreign key (manager_employee_id) references employees(id) on delete set null;

create index if not exists idx_employees_department on employees(department_id);
create index if not exists idx_employees_manager on employees(manager_id);

-- ---------------------------------------------------------------------
-- SKILLS
-- ---------------------------------------------------------------------
create table if not exists employee_skills (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  skill_name text not null,
  proficiency smallint not null check (proficiency between 1 and 5),
  unique (employee_id, skill_name)
);

create index if not exists idx_employee_skills_employee on employee_skills(employee_id);
create index if not exists idx_employee_skills_name on employee_skills(skill_name);

-- ---------------------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------------------
create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  status attendance_status not null,
  check_in time,
  check_out time,
  hours_worked numeric(4,1) not null default 0,
  unique (employee_id, date)
);

create index if not exists idx_attendance_employee_date on attendance(employee_id, date);
create index if not exists idx_attendance_date on attendance(date);

-- ---------------------------------------------------------------------
-- TICKETS
-- ---------------------------------------------------------------------
create table if not exists tickets (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  subject text not null,
  description text not null,
  category ticket_category not null default 'other',
  sentiment_label text,           -- positive | neutral | negative
  sentiment_score numeric(4,3),   -- -1.0 .. 1.0
  urgency ticket_urgency not null default 'low',
  status ticket_status not null default 'open',
  tier0_resolved boolean not null default false,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_tickets_employee on tickets(employee_id);
create index if not exists idx_tickets_status on tickets(status);

-- ---------------------------------------------------------------------
-- PROJECTS + MEMBERSHIP (drives Organizational Network Analysis graph)
-- ---------------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  department_id uuid references departments(id) on delete set null,
  status project_status not null default 'active',
  start_date date not null default current_date,
  end_date date
);

create table if not exists project_members (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  role_on_project text not null default 'contributor',
  unique (project_id, employee_id)
);

create index if not exists idx_project_members_project on project_members(project_id);
create index if not exists idx_project_members_employee on project_members(employee_id);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table profiles enable row level security;
alter table departments enable row level security;
alter table employees enable row level security;
alter table employee_skills enable row level security;
alter table attendance enable row level security;
alter table tickets enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;

-- Helper: is the current JWT user an admin or manager?
create or replace function is_hr_staff()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'manager')
  );
$$;

-- Helper: employee row id owned by the current user
create or replace function my_employee_id()
returns uuid
language sql
security definer
stable
as $$
  select e.id from employees e
  join profiles p on p.id = e.profile_id
  where p.id = auth.uid()
  limit 1;
$$;

-- profiles: everyone can read their own profile; HR staff read all
create policy profiles_self_select on profiles for select
  using (id = auth.uid() or is_hr_staff());
create policy profiles_self_update on profiles for update
  using (id = auth.uid());

-- departments: readable by everyone authenticated; writes by HR staff only
create policy departments_select on departments for select
  using (auth.role() = 'authenticated');
create policy departments_write on departments for all
  using (is_hr_staff()) with check (is_hr_staff());

-- employees: HR staff see all; employees see only their own record
create policy employees_select on employees for select
  using (is_hr_staff() or profile_id = auth.uid());
create policy employees_write on employees for all
  using (is_hr_staff()) with check (is_hr_staff());

-- employee_skills: same visibility as employees
create policy employee_skills_select on employee_skills for select
  using (is_hr_staff() or employee_id = my_employee_id());
create policy employee_skills_write on employee_skills for all
  using (is_hr_staff()) with check (is_hr_staff());

-- attendance: HR staff see all; employees see only their own rows
create policy attendance_select on attendance for select
  using (is_hr_staff() or employee_id = my_employee_id());
create policy attendance_write on attendance for all
  using (is_hr_staff()) with check (is_hr_staff());

-- tickets: HR staff see/manage all; employees see + create only their own
create policy tickets_select on tickets for select
  using (is_hr_staff() or employee_id = my_employee_id());
create policy tickets_insert on tickets for insert
  with check (is_hr_staff() or employee_id = my_employee_id());
create policy tickets_update on tickets for update
  using (is_hr_staff() or employee_id = my_employee_id());

-- projects / project_members: readable by all authenticated, written by HR staff
create policy projects_select on projects for select
  using (auth.role() = 'authenticated');
create policy projects_write on projects for all
  using (is_hr_staff()) with check (is_hr_staff());
create policy project_members_select on project_members for select
  using (auth.role() = 'authenticated');
create policy project_members_write on project_members for all
  using (is_hr_staff()) with check (is_hr_staff());

-- ---------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- Role/department are read from the signup metadata (see backend auth route).
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'employee'::public.app_role)
  );

  -- If HR already has an employee record for this email (pre-provisioned
  -- before the person ever logs in), link it to their new auth account so
  -- self-service sign-up "just works" for known employees.
  update public.employees
  set profile_id = new.id
  where email = new.email and profile_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
