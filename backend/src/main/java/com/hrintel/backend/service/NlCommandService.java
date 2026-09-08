package com.hrintel.backend.service;

import com.hrintel.backend.dto.CommandResult;
import com.hrintel.backend.dto.ParsedCommand;
import com.hrintel.backend.model.Department;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.model.Ticket;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** A 1:1 port of services/nlCommand.service.ts — regex-based intent parsing, no LLM involved. */
@Service
public class NlCommandService {

    private final MlServiceClient mlServiceClient;

    public NlCommandService(MlServiceClient mlServiceClient) {
        this.mlServiceClient = mlServiceClient;
    }

    // ---------------------------------------------------------------------
    // Privacy guard — runs before intent parsing. An employee may ask about
    // their own salary/performance/attendance/personal info; asking about
    // anyone else's is refused outright, with no further processing (no
    // confirming or denying whether the named person even works here).
    // ---------------------------------------------------------------------
    private static final String PRIVACY_REFUSAL = "Sorry, its private";

    private static final Pattern SALARY_TOPIC = Pattern.compile(
            "\\b(salary|salaries|wage|wages|compensation)\\b|how much (does|do|is)\\b.*\\b(make|makes|earn|earns|earning|get paid|paid)\\b",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern PERFORMANCE_TOPIC = Pattern.compile("\\bperformance\\s?(score|rating|review)?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTENDANCE_TOPIC = Pattern.compile("\\battendance\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PERSONAL_INFO_TOPIC = Pattern.compile(
            "\\bpersonal (info|information|details)\\b|\\b(home address|phone number|date of birth|social security|ssn|pto balance|leave balance|vacation balance)\\b",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern AGGREGATE_EXCEPTION = Pattern.compile(
            "\\b(average|median|range|company-wide|companywide|overall|typical|total payroll|compensation gap)\\b",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SELF_REFERENCE = Pattern.compile("\\b(my|i|me|mine)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern THIRD_PARTY_HINT = Pattern.compile(
            "\\b(he|she|him|her|his|hers|they|them|their|someone else|another employee|other employee|coworker|colleague)\\b",
            Pattern.CASE_INSENSITIVE
    );
    /**
     * Deliberately case-sensitive — a capitalized token used as the subject of a private-topic
     * verb, e.g. "Sarah's" or "does Sarah make". Requires a preceding space (not just a word
     * boundary) so a sentence-initial capital — "What's my salary?", "Is my PTO balance..." —
     * is never mistaken for a person's name; only a capitalized word appearing mid-sentence counts.
     */
    private static final Pattern NAMED_OTHER = Pattern.compile("(?<=\\s)[A-Z][a-zA-Z'-]{1,30}(?:'s\\b|\\s+(?:make|makes|earn|earns|earning|get paid|is paid))");

    private boolean isPrivateTopic(String text) {
        return SALARY_TOPIC.matcher(text).find()
                || PERFORMANCE_TOPIC.matcher(text).find()
                || ATTENDANCE_TOPIC.matcher(text).find()
                || PERSONAL_INFO_TOPIC.matcher(text).find();
    }

    /** Empty = not privacy-relevant, proceed with normal parsing. Present = the final answer (either the refusal, or a self-answer). */
    public Optional<CommandResult> applyPrivacyGuard(String text, Employee me) {
        if (AGGREGATE_EXCEPTION.matcher(text).find()) return Optional.empty();
        if (!isPrivateTopic(text)) return Optional.empty();

        boolean mentionsOther = THIRD_PARTY_HINT.matcher(text).find() || NAMED_OTHER.matcher(text).find();
        if (mentionsOther) return Optional.of(new CommandResult("text", PRIVACY_REFUSAL, null));

        boolean selfPhrased = SELF_REFERENCE.matcher(text).find();
        if (!selfPhrased) return Optional.of(new CommandResult("text", PRIVACY_REFUSAL, null));

        if (me == null) {
            return Optional.of(new CommandResult("text", "No employee record is linked to your account.", null));
        }
        return Optional.of(buildSelfAnswer(text, me));
    }

    private CommandResult buildSelfAnswer(String text, Employee me) {
        if (SALARY_TOPIC.matcher(text).find()) {
            return new CommandResult("text", "Your current salary is $" + String.format("%,.0f", me.salary()) + ".", null);
        }
        if (PERFORMANCE_TOPIC.matcher(text).find()) {
            return new CommandResult("text", "Your current performance score is " + Math.round(me.performanceScore()) + "/100.", null);
        }
        if (ATTENDANCE_TOPIC.matcher(text).find()) {
            return new CommandResult("text", "You can view your full attendance history on the Attendance page.", null);
        }
        return new CommandResult("text", "Your profile: " + me.jobTitle() + ", " + me.seniority() + " level, hired " + me.hireDate() + ".", null);
    }

    private record CommandPattern(String intent, String action, Pattern pattern, double confidence, Function<Matcher, Map<String, String>> extract) {
    }

    private static final List<CommandPattern> PATTERNS = List.of(
            new CommandPattern(
                    "execute", "approve_pending_leave",
                    Pattern.compile("approve\\s+(all\\s+)?pending\\s+(leave|pto|time off)\\s+(requests?\\s+)?(for\\s+([a-z ]+))?", Pattern.CASE_INSENSITIVE),
                    0.92,
                    m -> Map.of("department", trimOrEmpty(m.group(5)))
            ),
            new CommandPattern(
                    "synthesize", "compensation_gap",
                    Pattern.compile("(show|display|what('|’)s)\\s+(the\\s+)?compensation\\s+gap", Pattern.CASE_INSENSITIVE),
                    0.9, null
            ),
            new CommandPattern(
                    "synthesize", "headcount_trend",
                    Pattern.compile("(show|display|chart|plot)\\s+.*headcount", Pattern.CASE_INSENSITIVE),
                    0.85, null
            ),
            new CommandPattern(
                    "synthesize", "attrition_risk",
                    Pattern.compile("(show|display|who).*(flight risk|attrition|turnover risk)", Pattern.CASE_INSENSITIVE),
                    0.85, null
            ),
            new CommandPattern(
                    "query", "department_headcount",
                    Pattern.compile("how many (people|employees).*(in|on)\\s+([a-z ]+)", Pattern.CASE_INSENSITIVE),
                    0.8,
                    m -> Map.of("department", trimOrEmpty(m.group(3)))
            ),
            new CommandPattern(
                    "query", "open_tickets_count",
                    Pattern.compile("how many (open\\s+)?tickets", Pattern.CASE_INSENSITIVE),
                    0.75, null
            )
    );

    private static String trimOrEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    public ParsedCommand parseCommand(String text) {
        for (CommandPattern p : PATTERNS) {
            Matcher matcher = p.pattern().matcher(text);
            if (matcher.find()) {
                Map<String, String> entities = p.extract() != null ? p.extract().apply(matcher) : Map.of();
                return new ParsedCommand(p.intent(), p.action(), entities, p.confidence(), text);
            }
        }
        return new ParsedCommand("query", "unknown", Map.of(), 0.3, text);
    }

    public CommandResult executeCommand(ParsedCommand command, List<Employee> employees, List<Department> departments, List<Ticket> tickets) {
        return switch (command.action()) {
            case "approve_pending_leave" -> {
                String deptName = command.entities().get("department");
                Department dept = (deptName != null && !deptName.isBlank())
                        ? departments.stream().filter(d -> d.name().toLowerCase().contains(deptName.toLowerCase())).findFirst().orElse(null)
                        : null;
                List<Employee> scoped = dept != null
                        ? employees.stream().filter(e -> dept.id().equals(e.departmentId())).toList()
                        : employees;
                String message = "Simulated: approved all pending leave requests for " + scoped.size() + " employee(s)"
                        + (dept != null ? " in " + dept.name() : "")
                        + ". (No PTO requests table is wired up yet — this confirms the action the agent would take.)";
                yield new CommandResult("action_confirmation", message, null);
            }
            case "compensation_gap" -> {
                var result = mlServiceClient.simulateCompensationChange(employees, departments, 0);
                var gaps = employees.stream()
                        .filter(e -> "active".equals(e.status()))
                        .map(e -> {
                            double gapPct = e.marketSalary() > 0
                                    ? Math.round(((e.marketSalary() - e.salary()) / e.marketSalary()) * 1000) / 10.0
                                    : 0;
                            return new LinkedHashMap<String, Object>(Map.of("full_name", e.fullName(), "gap_pct", gapPct));
                        })
                        .sorted((a, b) -> Double.compare((double) b.get("gap_pct"), (double) a.get("gap_pct")))
                        .limit(10)
                        .toList();
                Map<String, Object> payload = Map.of(
                        "type", "bar",
                        "data", gaps,
                        "total_current_payroll", result.totalCurrent()
                );
                yield new CommandResult("chart", "Top 10 employees furthest below market compensation:", payload);
            }
            case "department_headcount" -> {
                String deptName = command.entities().getOrDefault("department", "");
                Department dept = departments.stream()
                        .filter(d -> d.name().toLowerCase().contains(deptName.toLowerCase()))
                        .findFirst().orElse(null);
                long count = dept == null ? 0 : employees.stream()
                        .filter(e -> dept.id().equals(e.departmentId()) && "active".equals(e.status()))
                        .count();
                String message = dept != null
                        ? dept.name() + " has " + count + " active employees."
                        : "I couldn't match \"" + deptName + "\" to a department.";
                yield new CommandResult("text", message, null);
            }
            case "open_tickets_count" -> {
                long openCount = tickets.stream().filter(t -> "open".equals(t.status()) || "in_progress".equals(t.status())).count();
                yield new CommandResult("text", "There are currently " + openCount + " open or in-progress tickets.", null);
            }
            default -> new CommandResult(
                    "text",
                    "I couldn't confidently map that to an action. Try things like \"Approve all pending leave requests for IT\" or \"Show compensation gap\".",
                    null
            );
        };
    }
}
