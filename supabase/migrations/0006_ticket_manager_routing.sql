-- Route tickets directly to the submitting employee's manager on creation.
alter table tickets add column if not exists assigned_to uuid references employees(id) on delete set null;

create index if not exists idx_tickets_assigned_to on tickets(assigned_to);
