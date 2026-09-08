package com.hrintel.backend.web;

import com.hrintel.backend.dto.CreateDailyWorkLogRequest;
import com.hrintel.backend.exception.ApiException;
import com.hrintel.backend.model.DailyWorkLog;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.security.CurrentProfile;
import com.hrintel.backend.service.SupabaseDataService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Employee self-reported daily work status: did they work, how many regular
 * vs. overtime hours, and how the day split across projects. One row per
 * (employee, date) — POSTing again for the same date upserts it.
 */
@RestController
@RequestMapping("/api/daily-work-logs")
public class DailyWorkLogController {

    /** Allowed float drift when checking allocation percent/hours sums (rounding in the UI, e.g. 33.3 x 3). */
    private static final double TOLERANCE = 0.6;
    private static final Set<String> LEAVE_REASONS = Set.of("sick", "vacation", "unpaid", "other");

    private final SupabaseDataService data;

    public DailyWorkLogController(SupabaseDataService data) {
        this.data = data;
    }

    @GetMapping("/mine")
    public List<DailyWorkLog> mine() {
        var profile = CurrentProfile.get();
        Employee me = data.getEmployeeByProfileId(profile.id())
                .orElseThrow(() -> ApiException.notFound("No employee record linked to this account"));
        return data.getDailyWorkLogs().stream().filter(l -> l.employeeId().equals(me.id())).toList();
    }

    /** HR staff (admin + manager): company-wide feed enriched with employee name + department, mirroring /attendance. */
    @GetMapping
    public List<Map<String, Object>> all() {
        var profile = CurrentProfile.get();
        if (!profile.isHrStaff()) throw ApiException.forbidden("HR staff only");

        List<DailyWorkLog> logs = data.getDailyWorkLogs();
        Map<String, Employee> employeesById = data.getEmployees().stream().collect(Collectors.toMap(Employee::id, e -> e));

        return logs.stream().map(l -> {
            Employee employee = employeesById.get(l.employeeId());
            Map<String, Object> json = new LinkedHashMap<>();
            json.put("id", l.id());
            json.put("employee_id", l.employeeId());
            json.put("log_date", l.logDate());
            json.put("worked", l.worked());
            json.put("leave_reason", l.leaveReason());
            json.put("standard_hours", l.standardHours());
            json.put("overtime_hours", l.overtimeHours());
            json.put("allocations", l.allocations());
            json.put("created_at", l.createdAt());
            json.put("updated_at", l.updatedAt());
            if (employee != null) {
                Map<String, Object> employeeJson = new LinkedHashMap<>();
                employeeJson.put("id", employee.id());
                employeeJson.put("full_name", employee.fullName());
                employeeJson.put("department_id", employee.departmentId());
                json.put("employee", employeeJson);
            } else {
                json.put("employee", null);
            }
            return json;
        }).toList();
    }

    @PostMapping
    public ResponseEntity<DailyWorkLog> submit(@Valid @RequestBody CreateDailyWorkLogRequest body) {
        var profile = CurrentProfile.get();
        Employee me = data.getEmployeeByProfileId(profile.id())
                .orElseThrow(() -> ApiException.notFound("No employee record linked to this account"));

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("employee_id", me.id());
        fields.put("log_date", body.logDate());
        fields.put("worked", body.worked());
        fields.put("updated_at", Instant.now().toString());

        if (body.worked()) {
            if (body.allocations() == null || body.allocations().isEmpty()) {
                throw ApiException.badRequest("At least one project allocation is required when worked is true");
            }
            double totalHours = body.standardHours() + body.overtimeHours();
            double percentSum = body.allocations().stream().mapToDouble(CreateDailyWorkLogRequest.AllocationInput::percent).sum();
            double hoursSum = body.allocations().stream().mapToDouble(CreateDailyWorkLogRequest.AllocationInput::hours).sum();
            boolean percentOk = Math.abs(percentSum - 100.0) <= TOLERANCE;
            boolean hoursOk = totalHours > 0 && Math.abs(hoursSum - totalHours) <= TOLERANCE;
            if (!percentOk && !hoursOk) {
                throw ApiException.badRequest("Project allocations must add up to 100% of the day, or to the total hours worked");
            }

            fields.put("leave_reason", null);
            fields.put("standard_hours", body.standardHours());
            fields.put("overtime_hours", body.overtimeHours());
            fields.put("allocations", body.allocations());
        } else {
            if (body.leaveReason() == null || !LEAVE_REASONS.contains(body.leaveReason())) {
                throw ApiException.badRequest("leave_reason must be one of: sick, vacation, unpaid, other");
            }
            fields.put("leave_reason", body.leaveReason());
            fields.put("standard_hours", 0);
            fields.put("overtime_hours", 0);
            fields.put("allocations", List.of());
        }

        DailyWorkLog created = data.upsertDailyWorkLog(fields);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
