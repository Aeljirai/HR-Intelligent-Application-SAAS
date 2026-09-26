# n8n automation — Daily HR report

Imports as one n8n workflow that runs every weekday morning and emails the
HR admin two Excel attachments:

1. **`employee-status-report-<date>.xlsx`** — every employee's status
   (active/on_leave/terminated), performance score, and contract type
   (full_time/part_time/contract/intern), plus department and job title.
2. **`timesheet-report-<date>.xlsx`** — every employee's worked hours for
   the most recently completed business day (check-in/check-out/hours
   worked, from the `attendance` table).

Both files are built entirely inside n8n (no external file storage) using
its built-in **Convert to File** node, then attached to a single email sent
via the built-in **Send Email (SMTP)** node.

## 1. Apply the database migration

The workflow reads a `contract_type` column that doesn't exist in the
original schema. Run the new migration in the Supabase SQL editor (or
`supabase db push`) before using this workflow:

```
supabase/migrations/0002_contract_type.sql
```

It adds `employees.contract_type` (`full_time` / `part_time` / `contract` /
`intern`), defaulting existing rows to `full_time`. If you re-seed the demo
data (`bun run seed` from `backend/`), the updated seed script now assigns
realistic contract types automatically.

## 2. Start n8n

An `n8n` service has been added to the root `docker-compose.yml`. It reuses
the same `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` values already in your
root `.env` (see `.env.example`) and adds two new ones:

```
HR_ADMIN_EMAIL=hr-admin@company.com     # who receives the daily report
SMTP_FROM_EMAIL=hr-automation@company.com
```

Then:

```bash
docker compose up -d n8n
```

Open http://localhost:5678 and create the local n8n owner account (first
run only).

> Running n8n outside Docker instead? Set `SUPABASE_URL`,
> `SUPABASE_SERVICE_ROLE_KEY`, `HR_ADMIN_EMAIL`, and `SMTP_FROM_EMAIL` as
> environment variables for the n8n process itself, and make sure
> `N8N_BLOCK_ENV_ACCESS_IN_NODE` is not set to `true` — the workflow reads
> these via `$env` in its HTTP Request and Send Email nodes.

## 3. Import the workflow

In n8n: **Workflows → Import from File** → select
`n8n/workflows/daily-hr-report.json`.

## 4. Set up the SMTP credential

The **Email HR Admin** node needs an SMTP credential (not shipped in the
JSON, since it holds a password). Open that node → **Credential** →
**Create New** → fill in your mail provider's host/port/user/password (e.g.
a Gmail app password, Office 365, or SES SMTP credentials) → save, then
select it in the node.

## 5. Sanity-check the imported nodes

n8n workflow JSON isn't always 100% forward/backward compatible across
versions — after import, quickly open each node once:

- **Get Employees / Get Departments / Get Attendance** (HTTP Request) —
  confirm the `apikey` / `Authorization` headers and query params look
  intact.
- **Convert Employees/Timesheet to XLSX** — confirm operation is `xlsx` and
  the binary property name matches (`employees` / `timesheet`).
- **Combine Attachments** (Merge) — mode `Combine` / `Combine by Position`.
- **Email HR Admin** — confirm `To`/`From`/`Subject`/`Attachments` fields
  rendered correctly and the SMTP credential is attached.

If a field shows as empty/red, n8n will tell you which one — just re-enter
that value; the underlying logic doesn't change.

## 6. Activate

Toggle the workflow **Active**. It runs at **07:00, Monday–Friday**
(cron `0 7 * * 1-5`), reporting on the most recently completed business day
(so a Monday run reports Friday's data). Edit the cron expression on the
**Daily 7AM Trigger** node to change the schedule.

## How it works

```
Schedule Trigger (weekdays 07:00)
  → Compute Report Date (last business day, as YYYY-MM-DD)
      → Get Employees ─────────┐        → Get Attendance (filtered to report date)
      → Get Departments        │              │
                                ▼              ▼
                  Build Employee Status Rows   Build Timesheet Rows
                                │                       │
                  Convert to XLSX ("employees")  Convert to XLSX ("timesheet")
                                └──────────┬────────────┘
                                    Combine Attachments (Merge)
                                                │
                                        Email HR Admin (SMTP)
```

All Supabase access uses the **service role key** directly against the
PostgREST API (`{{ $env.SUPABASE_URL }}/rest/v1/...`) — this bypasses Row
Level Security by design, the same way the backend's service-role client
does, since this is a trusted server-side automation, not a user-facing
client.

## Test workflow (random data, no Supabase required)

`n8n/workflows/daily-hr-report-test.json` is a standalone copy for trying out
the email flow without touching real data:

- Trigger is a **Manual Trigger** (run it on demand from the n8n editor)
  instead of the daily schedule.
- **Generate Random Employee Data** / **Generate Random Timesheet Data**
  (Code nodes) fabricate 8–12 rows each with random names, departments,
  statuses, and hours — no Supabase calls, so it works even without
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` configured.
- The **Email HR Admin (Test)** node sends from a fixed address
  (`al_eljirari@etu.enset-media.ac.ma`) to whatever `HR_ADMIN_EMAIL` is set
  to, subject-prefixed `[TEST]` so it's never mistaken for the real report.

Import it the same way (**Workflows → Import from File**), attach the same
SMTP credential to its **Email HR Admin (Test)** node, and run it manually.
It does not affect or replace `daily-hr-report.json`.

## Customizing

- **Add more fields** — extend the `select=` query parameter on the
  relevant HTTP Request node, then add the field in the corresponding
  `Build ... Rows` Code node.
- **Split into two emails** instead of one with two attachments — delete
  the `Combine Attachments` node and wire each `Convert to XLSX` node into
  its own `Send Email` node.
- **Change who receives it** — edit `HR_ADMIN_EMAIL` in `.env` and restart
  the `n8n` container (or edit the value directly in n8n's environment).
