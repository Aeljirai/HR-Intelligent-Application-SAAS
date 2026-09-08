package com.hrintel.backend.web;

import com.hrintel.backend.dto.CreateWellbeingRequest;
import com.hrintel.backend.dto.UpdateWellbeingStatusRequest;
import com.hrintel.backend.exception.ApiException;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.model.WellbeingClub;
import com.hrintel.backend.model.WellbeingRequest;
import com.hrintel.backend.security.CurrentProfile;
import com.hrintel.backend.service.SupabaseDataService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** A 1:1 port of routes/wellbeing.routes.ts. */
@RestController
@RequestMapping("/api/wellbeing")
public class WellbeingController {

    private final SupabaseDataService data;

    public WellbeingController(SupabaseDataService data) {
        this.data = data;
    }

    @GetMapping("/clubs")
    public List<WellbeingClub> clubs() {
        return data.getWellbeingClubs();
    }

    /**
     * Visibility: admin sees every request; a manager sees their own plus
     * their direct reports'; an employee sees only their own. No one but
     * admin gets status-change rights (enforced separately on the PATCH route below).
     */
    @GetMapping("/requests")
    public List<Map<String, Object>> requests() {
        var profile = CurrentProfile.get();
        List<WellbeingRequest> requests = data.getWellbeingRequests();
        List<Employee> employees = data.getEmployees();
        List<WellbeingClub> clubs = data.getWellbeingClubs();

        Map<String, Employee> employeesById = employees.stream().collect(Collectors.toMap(Employee::id, e -> e));
        Map<String, WellbeingClub> clubsById = clubs.stream().collect(Collectors.toMap(WellbeingClub::id, c -> c));

        List<WellbeingRequest> scoped = requests;
        if (!profile.isAdmin()) {
            Employee myEmployee = data.getEmployeeByProfileId(profile.id()).orElse(null);
            if (myEmployee == null) return List.of();

            if ("manager".equals(profile.role())) {
                Set<String> teamIds = employees.stream()
                        .filter(e -> myEmployee.id().equals(e.managerId()))
                        .map(Employee::id)
                        .collect(Collectors.toSet());
                teamIds.add(myEmployee.id());
                scoped = requests.stream().filter(r -> teamIds.contains(r.employeeId())).toList();
            } else {
                scoped = requests.stream().filter(r -> r.employeeId().equals(myEmployee.id())).toList();
            }
        }

        return scoped.stream().map(r -> {
            Employee employee = employeesById.get(r.employeeId());
            WellbeingClub club = r.clubId() != null ? clubsById.get(r.clubId()) : null;

            Map<String, Object> json = new LinkedHashMap<>();
            json.put("id", r.id());
            json.put("employee_id", r.employeeId());
            json.put("type", r.type());
            json.put("club_id", r.clubId());
            json.put("note", r.note());
            json.put("status", r.status());
            json.put("scheduled_at", r.scheduledAt());
            json.put("reviewed_by", r.reviewedBy());
            json.put("reviewer_note", r.reviewerNote());
            json.put("created_at", r.createdAt());
            json.put("updated_at", r.updatedAt());
            if (employee != null) {
                Map<String, Object> employeeJson = new LinkedHashMap<>();
                employeeJson.put("id", employee.id());
                employeeJson.put("full_name", employee.fullName());
                employeeJson.put("job_title", employee.jobTitle());
                employeeJson.put("department_id", employee.departmentId());
                json.put("employee", employeeJson);
            } else {
                json.put("employee", null);
            }
            json.put("club", club != null ? Map.of("id", club.id(), "name", club.name()) : null);
            return json;
        }).toList();
    }

    @PostMapping("/requests")
    public ResponseEntity<WellbeingRequest> createRequest(@Valid @RequestBody CreateWellbeingRequest body) {
        boolean clubRequired = "club_join".equals(body.type());
        if (clubRequired && (body.clubId() == null || body.clubId().isBlank())) {
            throw ApiException.badRequest("club_id is required for club_join requests and must be omitted otherwise");
        }
        if (!clubRequired && body.clubId() != null && !body.clubId().isBlank()) {
            throw ApiException.badRequest("club_id is required for club_join requests and must be omitted otherwise");
        }

        var profile = CurrentProfile.get();
        Employee myEmployee = data.getEmployeeByProfileId(profile.id())
                .orElseThrow(() -> ApiException.notFound("No employee record linked to this account"));

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("employee_id", myEmployee.id());
        fields.put("type", body.type());
        fields.put("club_id", body.clubId());
        fields.put("note", body.note());

        WellbeingRequest created = data.insertWellbeingRequest(fields);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /** Admin-only: approve, decline, or schedule a request. Managers get read-only visibility above. */
    @PatchMapping("/requests/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WellbeingRequest updateRequest(@PathVariable String id, @Valid @RequestBody UpdateWellbeingStatusRequest body) {
        if ("scheduled".equals(body.status()) && (body.scheduledAt() == null || body.scheduledAt().isBlank())) {
            throw ApiException.badRequest("scheduled_at is required when status is scheduled");
        }

        var profile = CurrentProfile.get();
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("status", body.status());
        fields.put("scheduled_at", "scheduled".equals(body.status()) ? body.scheduledAt() : null);
        fields.put("reviewer_note", body.reviewerNote());
        fields.put("reviewed_by", profile.id());
        fields.put("updated_at", Instant.now().toString());

        return data.updateWellbeingRequest(id, fields);
    }
}
