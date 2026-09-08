package com.hrintel.backend.seed;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.hrintel.backend.config.AppProperties;
import com.hrintel.backend.dto.SentimentAnalysis;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.service.MlServiceClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

/**
 * Seeds a Supabase project with realistic demo data — a faithful port of
 * backend/scripts/seed.ts (see backend-node-legacy/ for the original).
 * Uses the service-role key + Supabase's REST/Auth Admin APIs only (no raw
 * SQL against auth.users), so it's safe to run against any Supabase project.
 *
 * Usage: mvn spring-boot:run -Dspring-boot.run.profiles=seed
 *   (from backend/, after copying .env.example -> .env and running the
 *    supabase/migrations/*.sql files)
 */
@Component
@Profile("seed")
public class SeedRunner implements CommandLineRunner {

    private final WebClient rest;
    private final WebClient auth;
    private final AppProperties props;
    private final MlServiceClient ml;

    public SeedRunner(@Qualifier("supabaseRest") WebClient rest, @Qualifier("supabaseAuth") WebClient auth, AppProperties props, MlServiceClient ml) {
        this.rest = rest;
        this.auth = auth;
        this.props = props;
        this.ml = ml;
    }

    // ---------------------------------------------------------------
    // Deterministic PRNG so re-running the seed produces the same dataset.
    // ---------------------------------------------------------------
    private long seedState = 42;

    private double rand() {
        seedState = (seedState * 1103515245L + 12345L) & 0x7fffffffL;
        return seedState / (double) 0x7fffffff;
    }

    private int randInt(int min, int max) {
        return (int) Math.floor(rand() * (max - min + 1)) + min;
    }

    private <T> T pick(List<T> arr) {
        return arr.get(randInt(0, arr.size() - 1));
    }

    private double clamp01(double n) {
        return Math.min(1, Math.max(0, n));
    }

    private String daysAgo(int n) {
        return LocalDate.now().minusDays(n).toString();
    }

    private record DeptSeed(String name, String region, double budget, double lat, double lng) {
    }

    private static final List<DeptSeed> DEPARTMENTS = List.of(
            new DeptSeed("Engineering", "San Francisco, CA", 3_200_000, 37.7749, -122.4194),
            new DeptSeed("Product", "San Francisco, CA", 1_100_000, 37.7749, -122.4194),
            new DeptSeed("Sales", "New York, NY", 2_000_000, 40.7128, -74.006),
            new DeptSeed("Marketing", "New York, NY", 950_000, 40.7128, -74.006),
            new DeptSeed("Customer Support", "Austin, TX", 1_300_000, 30.2672, -97.7431),
            new DeptSeed("Human Resources", "Chicago, IL", 600_000, 41.8781, -87.6298),
            new DeptSeed("Finance", "Chicago, IL", 700_000, 41.8781, -87.6298),
            new DeptSeed("Operations", "Remote", 850_000, 39.8283, -98.5795)
    );

    private static final Map<String, List<String>> SKILL_POOL = Map.of(
            "Engineering", List.of("TypeScript", "React", "Node.js", "PostgreSQL", "Kubernetes", "Python", "Go", "AWS"),
            "Product", List.of("Roadmapping", "User Research", "SQL", "Figma", "A/B Testing", "Agile"),
            "Sales", List.of("Salesforce", "Negotiation", "Cold Outreach", "Account Management", "Forecasting"),
            "Marketing", List.of("SEO", "Content Strategy", "Google Ads", "Brand Design", "Analytics"),
            "Customer Support", List.of("Zendesk", "De-escalation", "Technical Troubleshooting", "Documentation"),
            "Human Resources", List.of("Recruiting", "Employee Relations", "HRIS", "Compensation Design"),
            "Finance", List.of("Financial Modeling", "Excel", "GAAP", "Forecasting", "Audit"),
            "Operations", List.of("Process Design", "Vendor Management", "Logistics", "Project Management")
    );

    private static final List<String> MALE_FIRST_NAMES = List.of("Youssef", "Mohamed", "Ahmed", "Hamza", "Yassine", "Anas", "Amine", "Karim", "Rachid", "Omar", "Adil", "Nabil", "Khalid", "Said", "Hicham", "Reda", "Soufiane", "Mehdi", "Zakaria", "Tarik", "Ayoub", "Ismail", "Younes", "Bilal", "Walid", "Marouane", "Othmane", "Imad", "Fouad", "Abdellah");
    private static final List<String> FEMALE_FIRST_NAMES = List.of("Fatima Zahra", "Khadija", "Meryem", "Salma", "Imane", "Nour", "Hajar", "Sanae", "Zineb", "Ghita", "Loubna", "Karima", "Naima", "Hanane", "Siham", "Amal", "Ibtissam", "Souad", "Asmaa", "Rania", "Yasmine", "Wafaa", "Samira", "Malak", "Nada", "Kenza", "Chaimae", "Nawal", "Latifa", "Btissam");
    private static final List<String> LAST_NAMES = List.of("Alaoui", "Benali", "El Amrani", "Bennani", "Chraibi", "El Fassi", "Tazi", "Idrissi", "Berrada", "El Khayat", "Ziani", "Sqalli", "Belkadi", "Cherkaoui", "Benjelloun", "El Ouazzani", "Lahlou", "Bouzid", "El Mansouri", "Guerraoui", "Naciri", "El Yacoubi", "Benkirane", "Amrani", "Sabri", "El Idrissi", "Bakkali", "Filali", "Bendriss", "Toumi");
    private static final List<String> SENIORITIES = List.of("junior", "mid", "mid", "senior", "senior", "lead");
    // Weighted so most employees are full-time, with a realistic minority on other contract types.
    private static final List<String> CONTRACT_TYPES = List.of("full_time", "full_time", "full_time", "full_time", "full_time", "full_time", "part_time", "contract", "intern");
    private static final Map<String, String> TITLE_BY_SENIORITY = Map.of(
            "junior", "Associate", "mid", "Specialist", "senior", "Senior Specialist", "lead", "Team Lead", "principal", "Principal"
    );

    private record DemoAccount(String email, String fullName, String role, String dept) {
    }

    private static final List<DemoAccount> DEMO_ACCOUNTS = List.of(
            new DemoAccount("admin@hr.com", "Hicham Alaoui", "admin", null),
            new DemoAccount("jordan.blake@company.com", "Mehdi Cherkaoui", "manager", "Engineering"),
            new DemoAccount("sarah.chen@company.com", "Btissam Tazi", "employee", "Engineering"),
            new DemoAccount("marcus.reyes@company.com", "Marcus Reyes", "employee", "Sales"),
            new DemoAccount("priya.desai@company.com", "Priya Desai", "employee", "Marketing"),
            new DemoAccount("wei.zhang@company.com", "Wei Zhang", "employee", "Customer Support"),
            new DemoAccount("elena.moreau@company.com", "Elena Moreau", "employee", "Finance")
    );

    @Override
    public void run(String... args) {
        try {
            seed();
        } catch (Exception e) {
            System.err.println("Seed failed: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private void seed() {
        System.out.println("Seeding HR Intelligence System...");
        String adminPassword = props.seed().adminPassword();
        String employeePassword = props.seed().employeePassword();

        // 1. Departments -------------------------------------------------
        List<Map<String, Object>> deptPayload = new ArrayList<>();
        for (DeptSeed d : DEPARTMENTS) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", d.name());
            m.put("region", d.region());
            m.put("budget", d.budget());
            m.put("kpi_completion", randInt(62, 97));
            m.put("output_score", randInt(58, 95));
            deptPayload.add(m);
        }
        List<Map<String, Object>> departments = upsert("/departments", deptPayload, "name");
        System.out.println("  departments: " + departments.size());
        Map<String, String> deptIdByName = new HashMap<>();
        for (var d : departments) deptIdByName.put((String) d.get("name"), (String) d.get("id"));

        // 2. Auth users for demo logins -----------------------------------
        Map<String, String> profileIdByEmail = new LinkedHashMap<>();
        List<Map<String, Object>> existingUsers = listAuthUsers();
        for (DemoAccount acct : DEMO_ACCOUNTS) {
            String password = acct.role().equals("admin") || acct.role().equals("manager") ? adminPassword : employeePassword;
            String userId = existingUsers.stream()
                    .filter(u -> acct.email().equals(u.get("email")))
                    .map(u -> (String) u.get("id"))
                    .findFirst()
                    .orElseGet(() -> createAuthUser(acct.email(), password, acct.fullName(), acct.role()));
            profileIdByEmail.put(acct.email(), userId);

            String deptId = acct.dept() != null ? deptIdByName.get(acct.dept()) : null;
            Map<String, Object> update = new LinkedHashMap<>();
            update.put("role", acct.role());
            update.put("department_id", deptId);
            update.put("full_name", acct.fullName());
            patch("/profiles", "id", userId, update);
        }
        System.out.println("  auth users: " + DEMO_ACCOUNTS.size());

        // 3. Employees ------------------------------------------------------
        List<Map<String, Object>> employeeSeeds = new ArrayList<>();
        Set<String> usedNames = new HashSet<>();
        int totalEmployees = 32;
        for (int i = 0; i < totalEmployees; i++) {
            String name;
            do {
                name = (rand() < 0.5 ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES)) + " " + pick(LAST_NAMES);
            } while (usedNames.contains(name));
            usedNames.add(name);

            DeptSeed dept = DEPARTMENTS.get(i % DEPARTMENTS.size());
            String seniority = i < DEPARTMENTS.size() ? "lead" : pick(SENIORITIES); // one lead per dept first
            int baseSalary = seniority.equals("lead") ? 135000 : seniority.equals("senior") ? 115000 : seniority.equals("mid") ? 90000 : 70000;
            int salary = baseSalary + randInt(-8000, 12000);
            int marketSalary = salary + randInt(-4000, 22000); // some are underpaid vs market, some aren't
            int hireDaysAgo = randInt(30, 6 * 365);
            // Department leads (first employee per department) are always full-time.
            String contractType = i < DEPARTMENTS.size() ? "full_time" : pick(CONTRACT_TYPES);
            int overtimeHoursMonth = randInt(0, 34);
            int daysSinceVacation = randInt(10, 260);
            // Loosely anti-correlated with overtime/vacation-gap so the seeded
            // population isn't independent noise across related burnout signals.
            double satisfactionLevel = clamp01(0.9 - overtimeHoursMonth / 60.0 - daysSinceVacation / 500.0 + (rand() - 0.5) * 0.3);

            Map<String, Object> e = new LinkedHashMap<>();
            e.put("full_name", name);
            e.put("email", name.toLowerCase().replaceAll("\\s+", ".") + "@company.com");
            e.put("department_id", deptIdByName.get(dept.name()));
            e.put("job_title", TITLE_BY_SENIORITY.get(seniority) + ", " + dept.name());
            e.put("seniority", seniority);
            e.put("hire_date", daysAgo(hireDaysAgo));
            e.put("salary", salary);
            e.put("market_salary", marketSalary);
            e.put("performance_score", randInt(55, 98));
            e.put("pto_balance", Math.round((randInt(0, 28) + rand()) * 10) / 10.0);
            e.put("pto_used_ytd", Math.round((randInt(0, 15) + rand()) * 10) / 10.0);
            e.put("status", "active");
            e.put("contract_type", contractType);
            e.put("region", dept.region());
            e.put("lat", dept.lat() + (rand() - 0.5) * 0.4);
            e.put("lng", dept.lng() + (rand() - 0.5) * 0.4);
            e.put("overtime_hours_month", overtimeHoursMonth);
            e.put("days_since_vacation", daysSinceVacation);
            e.put("satisfaction_level", Math.round(satisfactionLevel * 1000) / 1000.0);
            e.put("work_accident", rand() < 0.145);
            e.put("promotion_last_5years", rand() < 0.025);
            employeeSeeds.add(e);
        }

        // Explicitly overwrite emails/names for the demo login accounts so
        // sarah.chen@company.com etc. actually exist as employee rows.
        List<Map.Entry<String, String>> overrides = List.of(
                Map.entry("Btissam Tazi", "sarah.chen@company.com"),
                Map.entry("Marcus Reyes", "marcus.reyes@company.com"),
                Map.entry("Priya Desai", "priya.desai@company.com"),
                Map.entry("Wei Zhang", "wei.zhang@company.com"),
                Map.entry("Elena Moreau", "elena.moreau@company.com"),
                Map.entry("Mehdi Cherkaoui", "jordan.blake@company.com")
        );
        for (int i = 0; i < overrides.size() && i < employeeSeeds.size(); i++) {
            employeeSeeds.get(i).put("full_name", overrides.get(i).getKey());
            employeeSeeds.get(i).put("email", overrides.get(i).getValue());
        }

        List<Map<String, Object>> employees = upsert("/employees", employeeSeeds, "email");
        System.out.println("  employees: " + employees.size());

        // Link demo-login employees to their auth profile.
        Map<String, Map<String, Object>> employeeByEmail = new HashMap<>();
        for (var e : employees) employeeByEmail.put((String) e.get("email"), e);
        for (var entry : profileIdByEmail.entrySet()) {
            var emp = employeeByEmail.get(entry.getKey());
            if (emp != null) patch("/employees", "id", (String) emp.get("id"), Map.of("profile_id", entry.getValue()));
        }

        // Assign department managers (the 'lead' seeded first per department).
        for (int i = 0; i < departments.size() && i < employees.size(); i++) {
            patch("/departments", "id", (String) departments.get(i).get("id"), Map.of("manager_employee_id", employees.get(i).get("id")));
        }
        // Give every non-lead employee a manager within their department.
        Map<String, List<Map<String, Object>>> employeesByDept = new LinkedHashMap<>();
        for (var e : employees) employeesByDept.computeIfAbsent((String) e.get("department_id"), k -> new ArrayList<>()).add(e);
        for (var dept : departments) {
            var deptEmployees = employeesByDept.get(dept.get("id"));
            if (deptEmployees == null || deptEmployees.isEmpty()) continue;
            var lead = deptEmployees.get(0);
            for (int i = 1; i < deptEmployees.size(); i++) {
                patch("/employees", "id", (String) deptEmployees.get(i).get("id"), Map.of("manager_id", lead.get("id")));
            }
        }

        // 4. Skills -----------------------------------------------------------
        Map<String, String> deptNameById = new HashMap<>();
        for (var d : departments) deptNameById.put((String) d.get("id"), (String) d.get("name"));
        List<Map<String, Object>> skillRows = new ArrayList<>();
        for (var e : employees) {
            String deptName = deptNameById.getOrDefault(e.get("department_id"), "Engineering");
            List<String> pool = SKILL_POOL.getOrDefault(deptName, SKILL_POOL.get("Engineering"));
            int numSkills = Math.min(randInt(3, 5), pool.size());
            Set<String> chosen = new LinkedHashSet<>();
            while (chosen.size() < numSkills) chosen.add(pick(pool));
            for (String skill : chosen) {
                skillRows.add(new LinkedHashMap<>(Map.of("employee_id", e.get("id"), "skill_name", skill, "proficiency", randInt(2, 5))));
            }
        }
        upsert("/employee_skills", skillRows, "employee_id,skill_name");
        System.out.println("  skills: " + skillRows.size());

        // 5. Attendance (last 60 weekdays; Customer Support gets an
        //    anomalous spike in the most recent 7 days). -------------------
        List<Map<String, Object>> attendanceRows = new ArrayList<>();
        String supportDeptId = deptIdByName.get("Customer Support");
        LocalDate today = LocalDate.now();
        for (int dayOffset = 60; dayOffset >= 0; dayOffset--) {
            LocalDate date = today.minusDays(dayOffset);
            if (date.getDayOfWeek().getValue() == 6 || date.getDayOfWeek().getValue() == 7) continue; // skip weekends (Sat=6, Sun=7)
            String dateStr = date.toString();

            for (var e : employees) {
                boolean isRecentSupportSpike = supportDeptId != null && supportDeptId.equals(e.get("department_id")) && dayOffset <= 7;
                double roll = rand();
                String status;
                if (isRecentSupportSpike) {
                    status = roll < 0.22 ? "absent" : roll < 0.42 ? "late" : roll < 0.55 ? "remote" : "present";
                } else {
                    status = roll < 0.03 ? "absent" : roll < 0.08 ? "late" : roll < 0.25 ? "remote" : "present";
                }
                int checkInHour = status.equals("late") ? randInt(9, 11) : randInt(7, 9);
                int checkInMin = randInt(0, 59);
                double hours = status.equals("absent") ? 0 : Math.round((7 + rand() * 2) * 10) / 10.0;

                Map<String, Object> row = new LinkedHashMap<>();
                row.put("employee_id", e.get("id"));
                row.put("date", dateStr);
                row.put("status", status);
                row.put("check_in", status.equals("absent") ? null : "%02d:%02d:00".formatted(checkInHour, checkInMin));
                row.put("check_out", status.equals("absent") ? null : "%02d:%02d:00".formatted((checkInHour + 8) % 24, checkInMin));
                row.put("hours_worked", hours);
                attendanceRows.add(row);
            }
        }
        // Insert in chunks to stay under request size limits.
        for (int i = 0; i < attendanceRows.size(); i += 500) {
            upsert("/attendance", attendanceRows.subList(i, Math.min(i + 500, attendanceRows.size())), "employee_id,date");
        }
        System.out.println("  attendance records: " + attendanceRows.size());

        // 6. Tickets ------------------------------------------------------------
        List<String> ticketTexts = List.of(
                "How many vacation days do I have left this year?",
                "My direct deposit did not show up this week, can someone check payroll immediately?",
                "When does open enrollment for benefits start?",
                "I want to know more about the 401k matching program.",
                "My laptop keeps crashing and I cannot access the VPN, this is urgent and blocking my work today.",
                "Thanks so much for resolving my badge access issue so quickly, really appreciate the help!",
                "I am extremely frustrated, my manager ignored my complaint about a hostile coworker for weeks.",
                "Can I get a copy of my W-2 tax form from last year?",
                "The parking garage badge reader has been broken for three days.",
                "I need to escalate this to a manager immediately, this is unacceptable service.",
                "Question about how many PTO days I have accrued so far.",
                "Requesting information on dental and vision benefit coverage options.",
                "My paycheck seems wrong this cycle, the amount does not match my salary.",
                "Great experience with the new onboarding process, everything was smooth.",
                "I feel there has been discrimination in how shifts are assigned on my team.",
                "Can someone reset my password, I am locked out of my account.",
                "What is the process to update my direct deposit bank account?",
                "I am considering resigning if the workload does not improve soon."
        );

        List<Map<String, Object>> ticketRows = new ArrayList<>();
        for (String text : ticketTexts) {
            var emp = pick(employees);
            Employee employeeModel = toEmployee(emp);
            SentimentAnalysis analysis = ml.analyzeTicketText(text, employeeModel);
            int createdDaysAgo = randInt(0, 30);
            String status = analysis.tier0().resolved() ? "auto_resolved"
                    : "critical".equals(analysis.urgency()) ? "escalated"
                    : pick(List.of("open", "in_progress", "resolved"));

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("employee_id", emp.get("id"));
            row.put("subject", text.length() > 60 ? text.substring(0, 60) : text);
            row.put("description", text);
            row.put("category", analysis.category());
            row.put("sentiment_label", analysis.sentiment().label());
            row.put("sentiment_score", analysis.sentiment().score());
            row.put("urgency", analysis.urgency());
            row.put("status", status);
            row.put("tier0_resolved", analysis.tier0().resolved());
            row.put("resolution_note", analysis.tier0().note());
            row.put("created_at", Instant.now().minusSeconds(createdDaysAgo * 86400L).toString());
            row.put("resolved_at", analysis.tier0().resolved() ? Instant.now().toString() : null);
            ticketRows.add(row);
        }
        insert("/tickets", ticketRows);
        System.out.println("  tickets: " + ticketRows.size());

        // 7. Projects + memberships (drives the ONA graph) -----------------------
        List<String> projectNames = List.of(
                "Platform Migration", "Q3 Product Launch", "Customer Onboarding Revamp", "Sales Enablement Toolkit",
                "Brand Refresh", "Support Knowledge Base", "Compensation Review", "Vendor Consolidation",
                "Mobile App Redesign", "Data Warehouse Upgrade"
        );
        List<Map<String, Object>> projectSeeds = new ArrayList<>();
        for (String name : projectNames) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("name", name);
            p.put("department_id", pick(departments).get("id"));
            p.put("status", pick(List.of("active", "active", "planned", "completed")));
            p.put("start_date", daysAgo(randInt(30, 300)));
            projectSeeds.add(p);
        }
        List<Map<String, Object>> insertedProjects = insert("/projects", projectSeeds);

        List<Map<String, Object>> memberRows = new ArrayList<>();
        for (var project : insertedProjects) {
            int memberCount = randInt(3, 6);
            Set<String> chosen = new LinkedHashSet<>();
            String projectDeptId = (String) project.get("department_id");
            List<Map<String, Object>> sameDept = employees.stream().filter(e -> Objects.equals(e.get("department_id"), projectDeptId)).toList();
            List<Map<String, Object>> otherDept = employees.stream().filter(e -> !Objects.equals(e.get("department_id"), projectDeptId)).toList();
            while (chosen.size() < Math.min(memberCount - 1, sameDept.size()) && !sameDept.isEmpty()) chosen.add((String) pick(sameDept).get("id"));
            while (chosen.size() < memberCount && !otherDept.isEmpty()) chosen.add((String) pick(otherDept).get("id"));
            for (String employeeId : chosen) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("project_id", project.get("id"));
                m.put("employee_id", employeeId);
                m.put("role_on_project", pick(List.of("contributor", "lead", "reviewer")));
                memberRows.add(m);
            }
        }
        upsert("/project_members", memberRows, "project_id,employee_id");
        System.out.println("  projects: " + insertedProjects.size() + ", memberships: " + memberRows.size());

        // 8. Wellbeing clubs -----------------------------------------------------
        List<Map<String, Object>> clubSeeds = List.of(
                club("Morning Run Club", "Easy-pace group runs before the workday starts.", "fitness", "Tue/Thu 7:00 AM"),
                club("Mindfulness & Meditation", "Guided breathing and meditation sessions to reset mid-week.", "mindfulness", "Wednesdays 12:00 PM"),
                club("Book Club", "A rotating pick, one chapter-driven discussion a month.", "social", "First Friday, 5:00 PM"),
                club("Yoga & Stretch", "Beginner-friendly yoga to loosen up after long screen time.", "fitness", "Mon/Fri 8:00 AM"),
                club("Board Game Night", "Casual board games and pizza — no experience needed.", "social", "Every other Thursday, 6:00 PM"),
                club("Creative Arts Circle", "Sketching, painting, and craft sessions to unwind.", "creative", "Saturdays 10:00 AM")
        );
        List<Map<String, Object>> clubRows = upsert("/wellbeing_clubs", clubSeeds, "name");
        System.out.println("  wellbeing clubs: " + clubRows.size());

        System.out.println("\nSeed complete. Demo accounts:");
        System.out.println("  admin@hr.com / " + adminPassword);
        System.out.println("  jordan.blake@company.com (manager) / " + adminPassword);
        System.out.println("  sarah.chen@company.com (employee) / " + employeePassword);
        System.out.println("  marcus.reyes@company.com (employee) / " + employeePassword);
        System.out.println("  priya.desai@company.com (employee) / " + employeePassword);
        System.out.println("  wei.zhang@company.com (employee) / " + employeePassword);
        System.out.println("  elena.moreau@company.com (employee) / " + employeePassword);
    }

    private Map<String, Object> club(String name, String description, String category, String meetingSchedule) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("description", description);
        m.put("category", category);
        m.put("meeting_schedule", meetingSchedule);
        return m;
    }

    private Employee toEmployee(Map<String, Object> e) {
        return new Employee(
                (String) e.get("id"), null, (String) e.get("full_name"), (String) e.get("email"),
                (String) e.get("department_id"), (String) e.get("job_title"), (String) e.get("seniority"),
                (String) e.get("hire_date"), null,
                asDouble(e.get("salary")), asDouble(e.get("market_salary")), asDouble(e.get("performance_score")),
                asDouble(e.get("pto_balance")), asDouble(e.get("pto_used_ytd")), null,
                (String) e.get("status"), (String) e.get("contract_type"), (String) e.get("region"),
                asDoubleOrNull(e.get("lat")), asDoubleOrNull(e.get("lng")),
                asDouble(e.get("overtime_hours_month")), (int) asDouble(e.get("days_since_vacation")),
                asDouble(e.get("satisfaction_level")), (boolean) e.getOrDefault("work_accident", false),
                (boolean) e.getOrDefault("promotion_last_5years", false)
        );
    }

    private double asDouble(Object o) {
        return o == null ? 0 : ((Number) o).doubleValue();
    }

    private Double asDoubleOrNull(Object o) {
        return o == null ? null : ((Number) o).doubleValue();
    }

    // --- Supabase REST/Auth helpers -----------------------------------------

    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST_OF_MAPS = new ParameterizedTypeReference<>() {
    };

    private List<Map<String, Object>> upsert(String path, List<Map<String, Object>> rows, String onConflict) {
        if (rows.isEmpty()) return List.of();
        return rest.post().uri(b -> b.path(path).queryParam("on_conflict", onConflict).build())
                .header("Prefer", "resolution=merge-duplicates,return=representation")
                .bodyValue(rows)
                .retrieve().bodyToMono(LIST_OF_MAPS).block();
    }

    private List<Map<String, Object>> insert(String path, List<Map<String, Object>> rows) {
        if (rows.isEmpty()) return List.of();
        return rest.post().uri(path)
                .header("Prefer", "return=representation")
                .bodyValue(rows)
                .retrieve().bodyToMono(LIST_OF_MAPS).block();
    }

    private void patch(String path, String idColumn, String idValue, Map<String, Object> fields) {
        rest.patch().uri(b -> b.path(path).queryParam(idColumn, "eq." + idValue).build())
                .bodyValue(fields)
                .retrieve().bodyToMono(String.class).block();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record AuthUsersPage(List<Map<String, Object>> users) {
    }

    private List<Map<String, Object>> listAuthUsers() {
        AuthUsersPage page = auth.get().uri("/admin/users")
                .header("apikey", props.supabase().serviceRoleKey())
                .header("Authorization", "Bearer " + props.supabase().serviceRoleKey())
                .retrieve().bodyToMono(AuthUsersPage.class).block();
        return page == null || page.users() == null ? List.of() : page.users();
    }

    private String createAuthUser(String email, String password, String fullName, String role) {
        Map<String, Object> body = Map.of(
                "email", email,
                "password", password,
                "email_confirm", true,
                "user_metadata", Map.of("full_name", fullName, "role", role)
        );
        Map<String, Object> created = auth.post().uri("/admin/users")
                .header("apikey", props.supabase().serviceRoleKey())
                .header("Authorization", "Bearer " + props.supabase().serviceRoleKey())
                .bodyValue(body)
                .retrieve().bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {
                }).block();
        return (String) created.get("id");
    }
}
