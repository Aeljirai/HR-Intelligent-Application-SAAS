# HR Intelligence System

A full-stack HR analytics platform: React (built/run with Bun) on the frontend,
a Spring Boot (Java) API in the middle, a dedicated ML computation service, and
Supabase (Postgres + Auth + Row Level Security) as the database. Predictive/ML
features (anomaly detection, headcount forecasting, flight-risk scoring,
sentiment analysis, org-network analysis, shift optimization, resource
reallocation, compensation modeling) are hand-rolled, explainable,
deterministic algorithms — no third-party ML API, so they're cheap to run,
easy to audit, and fast enough to simulate live in the browser for things
like sliders.

## Architecture

```
┌─────────────────────┐   HTTPS (Bearer JWT)   ┌──────────────────────┐   HTTP (internal only)   ┌──────────────────────┐
│  React + Bun (Vite)  │ ─────────────────────▶ │  Spring Boot API    │ ───────────────────────▶ │  ML service          │
│  frontend/           │ ◀───────────────────── │  backend/           │ ◀─────────────────────── │  ml-service/         │
└──────────┬───────────┘                        └──────────┬──────────┘                          └──────────────────────┘
           │  Auth only                                     │ service_role                          pure computation —
           │  (sign in/up, session)                         │ (bypasses RLS,                         no Supabase access,
           ▼                                                │  own role checks)                      no external network
┌──────────────────────────────────────────────────────────▼────────────────────────────────────────────────────────────┐
│                                              Supabase (Postgres) — Cloud                                                │
│           auth.users → profiles (role) → employees → attendance / tickets / departments / projects                     │
│                  Row Level Security policies enforce "employees see only their own data"                                │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why this split?** The frontend never sees the Supabase service-role key —
only the low-privilege anon key, used exclusively for authentication. Every
piece of application data (employees, attendance, tickets, analytics) goes
through the Spring Boot API, which re-verifies the caller's Supabase session
on every request and applies its own role checks (`admin` / `manager` /
`employee`) before touching the database with the service-role client. Row
Level Security in Postgres is a second, independent layer of the same rule,
so a bug in the API can't leak another employee's data even if RLS were the
only thing standing in the way.

**Why a separate ML service?** `backend/` owns all Supabase access and
auth/role checks; `ml-service/` is pure computation (flight risk, sentiment/
Tier-0, anomaly detection, headcount forecast, ONA graph, compensation
sandbox, shift optimization, resource reallocation) with no database
connection and no inbound access from anywhere but the backend container.
The backend fetches rows from Supabase as before, POSTs them to ml-service,
and gets the computed result back — this keeps the ML logic independently
testable/deployable (see `ml-service/scripts/smoke-test-ml.ts`) without
giving it any credentials it doesn't need. The NL command parser
(`web/AgentController.java` / `service/NlCommandService.java`) stayed in the
backend since it's tightly coupled to role-based routing, not a standalone
algorithm — it calls ml-service too, for its one ML-dependent branch
(compensation gap).

## Setup

### 1. Create a Supabase project
Create a project at [supabase.com](https://supabase.com), then open the SQL
editor and run `supabase/migrations/0001_init.sql`. This creates every table,
enum, RLS policy, and the `handle_new_user` trigger that provisions a
`profiles` row (and links a pre-existing `employees` row by email, if HR
already added one) whenever someone signs up.

Grab three values from **Project Settings → API**:
- Project URL
- `anon` public key
- `service_role` key (keep this one server-side only)

### 2. Backend
Requires Java 21 (the bundled Maven wrapper handles the rest — no separate
Maven install needed).
```bash
cd backend
cp .env.example .env      # fill in SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
./mvnw spring-boot:run -Dspring-boot.run.profiles=seed   # one-off: creates demo accounts + ~32 employees + 60 days of attendance + tickets + projects, then exits
./mvnw spring-boot:run                                    # http://localhost:4000
```
(On Windows, use `mvnw.cmd` instead of `./mvnw`.)

### 3. Frontend
```bash
cd frontend
cp .env.example .env.local  # same Supabase URL + anon key, plus the API base URL
bun install
bun run dev                 # http://localhost:5173
```

### Running with Docker

Alternative to the three manual steps above: `frontend/`, `backend/`, and
`ml-service/` each run in their own container; Supabase stays Cloud-hosted
(no local database container — see Architecture above).

```bash
cp .env.example .env      # same 3 Supabase values as backend/.env.example
docker compose up --build # frontend :5173, backend :4000, ml-service internal-only
docker compose exec backend java -jar app.jar --spring.profiles.active=seed   # first run only — creates demo accounts + data, then exits
```

Then open http://localhost:5173. `ml-service` isn't published to the host —
only the `backend` container can reach it, at `http://ml-service:4100` over
the compose network. Rebuild the frontend image if you change any
`VITE_*` value (they're baked in at build time, not read at container
start) — `docker compose up --build frontend`.

### Demo accounts (created by the `seed` Spring profile above)
| Role | Email | Password |
|---|---|---|
| Admin | admin@hr.com | Admin123! |
| Manager | jordan.blake@company.com | Admin123! |
| Employee | sarah.chen@company.com | Employee123! |
| Employee | marcus.reyes@company.com | Employee123! |
| Employee | priya.desai@company.com | Employee123! |

## The 7 sections

1. **Dashboard** — Admin/manager view: rolling-window anomaly detection
   flags departments whose absenteeism or late-arrival rate crosses a 15%
   threshold *and* deviates from that department's own historical baseline
   (z-score), so naturally noisy teams don't false-alarm. A linear-regression
   headcount forecast projects 6 months forward with a volatility-based
   confidence band. Employees instead see a personal dashboard (PTO balance,
   performance, attendance breakdown, skills, career snapshot).
2. **Employees** *(admin/manager)* — Every employee's flight-risk score
   (tenure, performance trajectory, unused-PTO burnout proxy, compensation
   gap vs. market, overtime load, time since last vacation), explained as
   individually weighted factors. Alongside it, a second, independently
   computed **turnover model** score comes from a hand-rolled Random Forest
   (`ml-service/src/ml/turnoverModel.ts`) ported from the Kaggle notebook
   [dalekube/employee-flight-risk-model](https://www.kaggle.com/code/dalekube/employee-flight-risk-model)
   — trained offline once (`bun run train:turnover-model` in `ml-service/`,
   see `scripts/train-turnover-model.ts`) on the public `HR_comma_sep.csv`
   dataset (CC0) and shipped as a committed JSON artifact; nothing is
   trained at runtime. That dataset is a different population than this
   app's own seeded employees, so treat its probability as
   illustrative/demo-quality rather than a validated prediction for this
   specific org — it's a complement to the explainable flight-risk score
   above, not a replacement for it. The detail modal also runs a
   career-pathway skill-overlap analysis against the nearest more-senior
   role in the same department: matched skills vs. skills to develop.
3. **Analytics** *(admin/manager)* — An organizational network graph built
   from shared project membership (not a made-up social graph): employees who
   collaborate across departments are flagged as **bridges**; employees with
   no shared-project links are flagged **isolated**. A compensation sandbox
   lets you drag a −10%…+15% slider and see the payroll impact per department
   instantly (computed client-side — see "Client-side ML simulation" below).
4. **Attendance** — Admin/manager: shift-window sizing derived from the
   actual observed check-in histogram (not assumed shifts) plus a workforce
   map (headcount and active-ratio per region). Employees: their own
   attendance history.
5. **Departments** *(admin/manager)* — A ticket-load-per-headcount index per
   department flags over/under-loaded teams and proposes a conservative
   headcount transfer (~15% of the gap) between the most- and least-loaded
   departments. A budget-utilization and KPI/output heatmap sits alongside it.
6. **Tickets** — Every ticket runs through a small lexicon-based sentiment
   analyzer, urgency-keyword detector, and category classifier, then a
   routing decision (escalate vs. standard queue). A handful of common
   self-service questions (PTO balance, direct deposit timing, 401(k)
   matching, benefits enrollment window) get answered instantly by a
   **Tier-0 auto-resolution** rule set — no human touches those tickets.
   Employees see and file only their own tickets; HR staff see and triage
   everyone's.
7. **AI Agent** — A natural-language omnibar that pattern-matches free text
   into a typed command (`execute` / `synthesize` / `query`) with a
   confidence score, then actually runs it against live data: "Approve all
   pending leave requests for Engineering" returns a simulated action
   confirmation; "Show compensation gap" returns an inline bar chart of the
   employees furthest below market rate; "How many employees are in Sales?"
   is answered directly. Employees can only run read-only `query` commands.

## Client-side ML simulation

Three of the above are deliberately duplicated as pure, dependency-free
TypeScript in `frontend/src/lib/ml/` (flight-risk scoring, compensation
sandbox, sentiment/urgency/category/Tier-0 detection) so their *interactive*
surfaces — dragging a slider, typing into the ticket composer — update
instantly with no network round-trip. The backend keeps its own copy as the
source of truth for anything actually persisted (a submitted ticket is
always re-analyzed server-side before it's saved); the client copy only ever
drives a live preview. This is the "client-side simulation for
predictive/ML features" requirement, applied specifically where round-trip
latency would otherwise be felt.

## Additional tools, and why

| Tool | Where | Why it's here |
|---|---|---|
| **Jakarta Bean Validation** | backend | Declarative `@NotBlank`/`@Size`/`@Pattern` request validation on controller DTOs — catches a malformed ticket/compensation-sandbox payload before it touches Supabase, with a consistent `{ "error": ... }` shape for the frontend. |
| **Spring Security (stateless)** | backend | A custom filter re-verifies the caller's Supabase bearer token on every request (calling Supabase Auth's own `/auth/v1/user` endpoint) and loads their app role from `profiles`; `@PreAuthorize` on controllers enforces `admin`/`manager`-only routes — no sessions, no cookies. |
| **@supabase/supabase-js** | frontend | Official client, used *only* for auth (sign in/up, session refresh) — the frontend never talks to Supabase's REST API directly. The backend instead talks to Supabase's REST (PostgREST) and Auth HTTP APIs directly over `WebClient`, with the service-role key for all actual data access. |
| **TanStack Query** | frontend | Request caching, de-duping, loading/error state, and cache invalidation after mutations (e.g., submitting a ticket immediately refreshes the ticket list) — without hand-rolling `useEffect` fetch logic seven times over. |
| **Zustand** | frontend | A ~1KB global store for auth/session state (current user, profile, sign in/out) — no provider tree, no boilerplate, and it plays cleanly with React Query without either fighting for the same job. |
| **Tailwind CSS** | frontend | Utility-first styling for the whole design system (the light, card-based, blue-accented look inspired by the reference screenshot) without hand-writing a CSS file per component. |
| **lucide-react** | frontend | A single consistent icon set (sidebar nav, buttons, status icons) instead of mixing icon fonts/SVGs from different sources. |
| **Hand-rolled `lib/stats.ts`** | backend | Mean/standard-deviation/linear-regression are ~30 lines total; writing them removed a dependency (`simple-statistics`) for something this small and auditable, and let the whole ML layer be exercised with zero installed packages (see Testing below). |
| **Custom SVG charts** | frontend | Every chart (forecast line + confidence band, horizontal bar, radial gauge, sequential heatmap, network graph, geo map) is hand-built inline SVG rather than a charting library — full control over the exact interactions (hover tooltips, pulsing bridge/anomaly indicators) and zero extra bundle weight. Colors follow a categorical/sequential/diverging/status separation (fixed hue order, one hue for magnitude, reserved status colors) rather than ad-hoc color picks. |
| **Native `Intl`** | frontend | Currency/date/percent formatting via the browser's built-in `Intl` APIs instead of adding `date-fns` or a currency-formatting library. |

## Testing

`ml-service/scripts/smoke-test-ml.ts` is a zero-dependency sanity check for
every pure ML/analytics function (flight risk, sentiment/Tier-0, anomaly
detection, headcount forecast, ONA graph roles, shift optimization, resource
reallocation, compensation sandbox) against hand-built fixtures with known
expected outcomes — run it with `bun run smoke-test` from `ml-service/`.
`backend/src/test/java/.../service/NlCommandServiceTest.java` is the
equivalent for NL command parsing (`parseCommand`), run with `./mvnw test`
from `backend/` (that also runs `TurnoverFeatureMapperTest` and
`PolicyRetrievalServiceTest`). None of these require network access or a
real Supabase project — they're logic checks, not a substitute for
integration tests.

`frontend/scripts/verify-imports.mjs` is a similar zero-dependency check that
every internal `@/...` and relative import in the frontend actually resolves
to a file that exports the name being imported — useful for catching typo'd
paths before a real TypeScript compile (which needs `bun install`) is
available.

## Automation (n8n)

`n8n/` contains an importable n8n workflow that emails the HR admin a daily
report every weekday morning: an employee status/performance/contract-type
roster and a timesheet of worked hours, both as Excel attachments built
directly by n8n from Supabase data. See [`n8n/README.md`](n8n/README.md)
for setup (migration, Docker service, SMTP credential, import steps).

## Known limitations / next steps

- **Self-service sign-up** links to a pre-existing `employees` row by email
  automatically (see the migration's trigger), but if no HR-provisioned
  employee record exists yet, a newly self-registered account will get a
  profile with no linked employee record — `/employees/me` and similar
  endpoints will 404 until HR creates that employee record.
- **Dark mode** isn't implemented; the design targets the light theme only.
- The four manager/admin-only panels discussed after the core build (Flight
  Risk Simulator with live gauge + sliders, Talent Marketplace search,
  Onboarding Tracker with a simulated event stream, and the floating HR
  Co-Pilot chat) are a deliberate follow-up phase — the scoring/sentiment
  engines they'd reuse (`computeFlightRisk`, the sentiment/Tier-0 pipeline)
  already exist in both backend and frontend, so that phase is mostly UI.
- This was built in a sandboxed environment with no package-registry network
  access, so `bun install` / a live dev server / screenshots could not be
  run here. Logic was verified with the zero-dependency scripts above and
  careful manual review; run the full stack locally to see it live.
