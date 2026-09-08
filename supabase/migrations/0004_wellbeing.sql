-- =====================================================================
-- Wellbeing: browse activity clubs + request to join, or request
-- psychiatric support. Visibility is three-tiered:
--   employee -> only their own requests, no status-change rights
--   manager  -> read-only visibility into their direct reports' requests
--   admin    -> full visibility + approve/decline/schedule
-- =====================================================================

do $$ begin
  create type wellbeing_request_type as enum ('club_join', 'psychiatric_support');
exception when duplicate_object then null; end $$;

do $$ begin
  create type wellbeing_request_status as enum ('pending', 'approved', 'declined', 'scheduled');
exception when duplicate_object then null; end $$;

create table if not exists wellbeing_clubs (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text not null default '',
  category text not null default 'general',
  meeting_schedule text,
  created_at timestamptz not null default now()
);

create table if not exists wellbeing_requests (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  type wellbeing_request_type not null,
  club_id uuid references wellbeing_clubs(id) on delete set null,
  note text,
  status wellbeing_request_status not null default 'pending',
  scheduled_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellbeing_requests_club_required check (
    (type = 'club_join' and club_id is not null) or
    (type = 'psychiatric_support' and club_id is null)
  )
);

create index if not exists idx_wellbeing_requests_employee on wellbeing_requests(employee_id);
create index if not exists idx_wellbeing_requests_status on wellbeing_requests(status);

alter table wellbeing_clubs enable row level security;
alter table wellbeing_requests enable row level security;

-- Helper: is the current JWT user specifically an admin (HR)? Distinct from
-- is_hr_staff() (admin OR manager) — wellbeing approve/decline/schedule is
-- admin-only, managers get read-only visibility into their team.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- clubs: browsable by everyone authenticated; managed by admin only
create policy wellbeing_clubs_select on wellbeing_clubs for select
  using (auth.role() = 'authenticated');
create policy wellbeing_clubs_write on wellbeing_clubs for all
  using (is_admin()) with check (is_admin());

-- requests: own rows, or (as manager) direct reports' rows, or (as admin) all rows.
-- Only the requester can insert (always as themselves); only admin can update status.
create policy wellbeing_requests_select on wellbeing_requests for select
  using (
    is_admin()
    or employee_id = my_employee_id()
    or employee_id in (select id from employees where manager_id = my_employee_id())
  );
create policy wellbeing_requests_insert on wellbeing_requests for insert
  with check (employee_id = my_employee_id());
create policy wellbeing_requests_update on wellbeing_requests for update
  using (is_admin()) with check (is_admin());
