package com.hrintel.backend.service;

import com.hrintel.backend.dto.*;
import com.hrintel.backend.model.AttendanceRecord;
import com.hrintel.backend.model.Department;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.model.ProjectMember;
import com.hrintel.backend.model.Ticket;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Thin HTTP client for the ml-service container — a 1:1 port of
 * backend/src/lib/mlClient.ts. This backend still owns all Supabase access;
 * it fetches rows via SupabaseDataService and hands them to ml-service,
 * which is pure computation with no database of its own.
 *
 * ml-service's own JSON schema is a mix of snake_case and camelCase across
 * endpoints (an organic inconsistency in the original TS code, not a typo)
 * — request bodies are built here field-by-field to match each endpoint
 * exactly, rather than relying on one global naming convention.
 */
@Service
public class MlServiceClient {

    private final WebClient ml;

    public MlServiceClient(@Qualifier("mlService") WebClient ml) {
        this.ml = ml;
    }

    private <T> T post(String path, Object body, ParameterizedTypeReference<T> type) {
        return ml.post().uri(path).bodyValue(body).retrieve().bodyToMono(type).block();
    }

    public FlightRiskResult computeFlightRisk(Employee employee, FlightRiskOverrides overrides) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("employee", employee);
        if (overrides != null) body.put("overrides", overrides);
        return post("/flight-risk/compute", body, new ParameterizedTypeReference<>() {
        });
    }

    public List<FlightRiskResult> computeFlightRiskBatch(List<Employee> employees) {
        return post("/flight-risk/compute-batch", Map.of("employees", employees), new ParameterizedTypeReference<>() {
        });
    }

    public FlightRiskCounterfactuals computeFlightRiskCounterfactuals(Employee employee, RiskBounds bounds) {
        return post("/flight-risk/counterfactuals", Map.of("employee", employee, "bounds", bounds), new ParameterizedTypeReference<>() {
        });
    }

    public TurnoverRiskResult computeTurnoverRisk(String employeeId, TurnoverFeatures features) {
        return post("/turnover-model/compute", Map.of("employee_id", employeeId, "features", features), new ParameterizedTypeReference<>() {
        });
    }

    public record TurnoverBatchItem(String employeeId, TurnoverFeatures features) {
    }

    public List<TurnoverRiskResult> computeTurnoverRiskBatch(List<TurnoverBatchItem> items) {
        return post("/turnover-model/compute-batch", Map.of("items", items), new ParameterizedTypeReference<>() {
        });
    }

    public SentimentAnalysis analyzeTicketText(String text, Employee employee) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", text);
        if (employee != null) body.put("employee", employee);
        return post("/sentiment/analyze", body, new ParameterizedTypeReference<>() {
        });
    }

    public List<AttendanceAnomaly> detectAttendanceAnomalies(List<AttendanceRecord> attendance, List<Employee> employees, List<Department> departments) {
        return post("/anomaly-detection", Map.of("attendance", attendance, "employees", employees, "departments", departments), new ParameterizedTypeReference<>() {
        });
    }

    public List<HeadcountPoint> forecastHeadcount(List<Employee> employees, Integer monthsAhead) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("employees", employees);
        if (monthsAhead != null) body.put("monthsAhead", monthsAhead);
        return post("/headcount-forecast", body, new ParameterizedTypeReference<>() {
        });
    }

    public OnaGraph buildOnaGraph(List<Employee> employees, List<ProjectMember> memberships) {
        return post("/ona-graph", Map.of("employees", employees, "memberships", memberships), new ParameterizedTypeReference<>() {
        });
    }

    public List<PulseNode> computeSentimentPulse(List<String> employeeIds, List<Ticket> tickets, OnaGraph graph) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("employeeIds", employeeIds);
        body.put("tickets", tickets);
        body.put("graph", graph);
        return post("/sentiment-pulse", body, new ParameterizedTypeReference<>() {
        });
    }

    public CompensationSandboxResult simulateCompensationChange(List<Employee> employees, List<Department> departments, double adjustmentPct) {
        return post("/compensation-sandbox", Map.of("employees", employees, "departments", departments, "adjustment_pct", adjustmentPct), new ParameterizedTypeReference<>() {
        });
    }

    public ShiftPlan optimizeShifts(List<AttendanceRecord> attendance, List<Employee> employees, String departmentId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("attendance", attendance);
        body.put("employees", employees);
        body.put("departmentId", departmentId);
        return post("/shift-optimizer", body, new ParameterizedTypeReference<>() {
        });
    }

    public ReallocationResult computeReallocation(List<Department> departments, List<Employee> employees, List<Ticket> tickets) {
        return post("/resource-reallocation", Map.of("departments", departments, "employees", employees, "tickets", tickets), new ParameterizedTypeReference<>() {
        });
    }
}
