package com.hrintel.backend.service;

import com.hrintel.backend.model.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Thin typed wrappers around Supabase's PostgREST API — a 1:1 port of
 * services/supabaseData.service.ts. Every call here uses the service-role
 * key (baked into the injected WebClient — see WebClientConfig), so callers
 * (controllers) are responsible for having already run auth/role checks and
 * for filtering results down to "my own records only" when the caller is a
 * plain employee, exactly as the original route handlers do.
 */
@Service
public class SupabaseDataService {

    private final WebClient rest;

    public SupabaseDataService(@Qualifier("supabaseRest") WebClient rest) {
        this.rest = rest;
    }

    private static final ParameterizedTypeReference<List<Department>> DEPARTMENT_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<Employee>> EMPLOYEE_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<EmployeeSkill>> SKILL_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<AttendanceRecord>> ATTENDANCE_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<Ticket>> TICKET_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<Project>> PROJECT_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<ProjectMember>> PROJECT_MEMBER_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<WellbeingClub>> CLUB_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<WellbeingRequest>> WELLBEING_REQUEST_LIST = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<DailyWorkLog>> DAILY_WORK_LOG_LIST = new ParameterizedTypeReference<>() {
    };

    public List<Department> getDepartments() {
        return rest.get().uri(b -> b.path("/departments").queryParam("select", "*").queryParam("order", "name").build())
                .retrieve().bodyToMono(DEPARTMENT_LIST).block();
    }

    public List<Employee> getEmployees() {
        return rest.get().uri(b -> b.path("/employees").queryParam("select", "*").queryParam("order", "full_name").build())
                .retrieve().bodyToMono(EMPLOYEE_LIST).block();
    }

    public List<EmployeeSkill> getEmployeeSkills() {
        return rest.get().uri(b -> b.path("/employee_skills").queryParam("select", "*").build())
                .retrieve().bodyToMono(SKILL_LIST).block();
    }

    public List<AttendanceRecord> getAttendance(String sinceDate) {
        return rest.get().uri(b -> {
                    b.path("/attendance").queryParam("select", "*").queryParam("order", "date");
                    if (sinceDate != null) b.queryParam("date", "gte." + sinceDate);
                    return b.build();
                })
                .retrieve().bodyToMono(ATTENDANCE_LIST).block();
    }

    public List<Ticket> getTickets() {
        return rest.get().uri(b -> b.path("/tickets").queryParam("select", "*").queryParam("order", "created_at.desc").build())
                .retrieve().bodyToMono(TICKET_LIST).block();
    }

    public List<Project> getProjects() {
        return rest.get().uri(b -> b.path("/projects").queryParam("select", "*").build())
                .retrieve().bodyToMono(PROJECT_LIST).block();
    }

    public List<ProjectMember> getProjectMembers() {
        return rest.get().uri(b -> b.path("/project_members").queryParam("select", "*").build())
                .retrieve().bodyToMono(PROJECT_MEMBER_LIST).block();
    }

    public List<WellbeingClub> getWellbeingClubs() {
        return rest.get().uri(b -> b.path("/wellbeing_clubs").queryParam("select", "*").queryParam("order", "name").build())
                .retrieve().bodyToMono(CLUB_LIST).block();
    }

    public List<WellbeingRequest> getWellbeingRequests() {
        return rest.get().uri(b -> b.path("/wellbeing_requests").queryParam("select", "*").queryParam("order", "created_at.desc").build())
                .retrieve().bodyToMono(WELLBEING_REQUEST_LIST).block();
    }

    public List<DailyWorkLog> getDailyWorkLogs() {
        return rest.get().uri(b -> b.path("/daily_work_logs").queryParam("select", "*").queryParam("order", "log_date.desc").build())
                .retrieve().bodyToMono(DAILY_WORK_LOG_LIST).block();
    }

    /** Upsert on (employee_id, log_date) — resubmitting the same day overwrites it. */
    public DailyWorkLog upsertDailyWorkLog(Map<String, Object> fields) {
        List<DailyWorkLog> result = rest.post()
                .uri(b -> b.path("/daily_work_logs").queryParam("on_conflict", "employee_id,log_date").build())
                .header("Prefer", "resolution=merge-duplicates,return=representation")
                .bodyValue(fields)
                .retrieve().bodyToMono(DAILY_WORK_LOG_LIST).block();
        return result.get(0);
    }

    public Optional<Employee> getEmployeeByProfileId(String profileId) {
        List<Employee> found = rest.get()
                .uri(b -> b.path("/employees").queryParam("select", "*").queryParam("profile_id", "eq." + profileId).build())
                .retrieve().bodyToMono(EMPLOYEE_LIST).block();
        return found == null || found.isEmpty() ? Optional.empty() : Optional.of(found.get(0));
    }

    public Optional<Employee> getEmployeeById(String id) {
        List<Employee> found = rest.get()
                .uri(b -> b.path("/employees").queryParam("select", "*").queryParam("id", "eq." + id).build())
                .retrieve().bodyToMono(EMPLOYEE_LIST).block();
        return found == null || found.isEmpty() ? Optional.empty() : Optional.of(found.get(0));
    }

    /** Inserts a row and returns the representation Postgres created (Prefer: return=representation). */
    public Ticket insertTicket(Map<String, Object> fields) {
        List<Ticket> created = rest.post().uri("/tickets")
                .header("Prefer", "return=representation")
                .bodyValue(fields)
                .retrieve().bodyToMono(TICKET_LIST).block();
        return created.get(0);
    }

    public Ticket updateTicketStatus(String id, Map<String, Object> fields) {
        List<Ticket> updated = rest.patch()
                .uri(b -> b.path("/tickets").queryParam("id", "eq." + id).build())
                .header("Prefer", "return=representation")
                .bodyValue(fields)
                .retrieve().bodyToMono(TICKET_LIST).block();
        return updated.get(0);
    }

    public WellbeingRequest insertWellbeingRequest(Map<String, Object> fields) {
        List<WellbeingRequest> created = rest.post().uri("/wellbeing_requests")
                .header("Prefer", "return=representation")
                .bodyValue(fields)
                .retrieve().bodyToMono(WELLBEING_REQUEST_LIST).block();
        return created.get(0);
    }

    public WellbeingRequest updateWellbeingRequest(String id, Map<String, Object> fields) {
        List<WellbeingRequest> updated = rest.patch()
                .uri(b -> b.path("/wellbeing_requests").queryParam("id", "eq." + id).build())
                .header("Prefer", "return=representation")
                .bodyValue(fields)
                .retrieve().bodyToMono(WELLBEING_REQUEST_LIST).block();
        return updated.get(0);
    }
}
