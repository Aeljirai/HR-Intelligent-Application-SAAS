-- =====================================================================
-- Add contract type to employees (full_time / part_time / contract / intern)
-- Needed by the n8n daily HR report automation — see n8n/README.md.
-- =====================================================================

do $$ begin
  create type contract_type as enum ('full_time', 'part_time', 'contract', 'intern');
exception when duplicate_object then null; end $$;

alter table employees
  add column if not exists contract_type contract_type not null default 'full_time';
