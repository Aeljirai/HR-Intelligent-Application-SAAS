package com.hrintel.backend.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hrintel.backend.dto.FlightRiskCounterfactuals;
import com.hrintel.backend.dto.FlightRiskOverrides;
import com.hrintel.backend.dto.FlightRiskResult;
import com.hrintel.backend.dto.FlightRiskSimulateRequest;
import com.hrintel.backend.dto.RiskBounds;
import com.hrintel.backend.dto.TurnoverFeatures;
import com.hrintel.backend.dto.TurnoverRiskResult;
import com.hrintel.backend.exception.ApiException;
import com.hrintel.backend.model.AttendanceRecord;
import com.hrintel.backend.model.Department;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.model.EmployeeSkill;
import com.hrintel.backend.model.ProjectMember;
import com.hrintel.backend.security.CurrentProfile;
import com.hrintel.backend.service.MlServiceClient;
import com.hrintel.backend.service.SupabaseDataService;
import com.hrintel.backend.service.TurnoverFeatureMapper;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** A 1:1 port of routes/employees.routes.ts. */
@RestController
@RequestMapping("/api/employees")
public class EmployeesController {

    private final SupabaseDataService data;
    private final MlServiceClient ml;
    private final TurnoverFeatureMapper turnoverFeatureMapper;
    private final ObjectMapper objectMapper;

    public EmployeesController(SupabaseDataService data, MlServiceClient ml, TurnoverFeatureMapper turnoverFeatureMapper, ObjectMapper objectMapper) {
        this.data = data;
        this.ml = ml;
        this.turnoverFeatureMapper = turnoverFeatureMapper;
        this.objectMapper = objectMapper;
    }

    /** Derives ml-service turnover-model input for a set of employees, fetching the attendance/project/department rows the mapping needs. */
    private List<MlServiceClient.TurnoverBatchItem> buildTurnoverBatch(List<Employee> employees) {
        String since = Instant.now().minusSeconds(30L * 24 * 60 * 60).toString().substring(0, 10);
        List<AttendanceRecord> attendance = data.getAttendance(since);
        List<ProjectMember> projectMembers = data.getProjectMembers();
        List<Department> departments = data.getDepartments();

        Map<String, List<AttendanceRecord>> attendanceByEmployee = attendance.stream()
                .collect(Collectors.groupingBy(AttendanceRecord::employeeId));
        Map<String, Integer> projectCountByEmployee = new HashMap<>();
        for (ProjectMember m : projectMembers) {
            projectCountByEmployee.merge(m.employeeId(), 1, Integer::sum);
        }
        Map<String, Department> departmentsById = departments.stream().collect(Collectors.toMap(Department::id, d -> d));

        List<MlServiceClient.TurnoverBatchItem> items = new ArrayList<>();
        for (Employee e : employees) {
            TurnoverFeatures features = turnoverFeatureMapper.deriveTurnoverFeatures(
                    e,
                    attendanceByEmployee.getOrDefault(e.id(), List.of()),
                    projectCountByEmployee.getOrDefault(e.id(), 0),
                    departmentsById
            );
            items.add(new MlServiceClient.TurnoverBatchItem(e.id(), features));
        }
        return items;
    }

    private Map<String, Object> enrich(Employee e, List<EmployeeSkill> skills, FlightRiskResult flightRisk, TurnoverRiskResult turnoverModel) {
        Map<String, Object> json = objectMapper.convertValue(e, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {
        });
        json.put("skills", skills);
        json.put("flight_risk", flightRisk);
        json.put("turnover_model", turnoverModel);
        return json;
    }

    /** HR staff: everyone. Employees: only their own record. */
    @GetMapping
    public List<Map<String, Object>> list() {
        var profile = CurrentProfile.get();
        List<Employee> employees = data.getEmployees();
        List<EmployeeSkill> skills = data.getEmployeeSkills();

        List<Employee> scoped = profile.isHrStaff()
                ? employees
                : employees.stream().filter(e -> profile.id().equals(e.profileId())).toList();

        Map<String, List<EmployeeSkill>> skillsByEmployee = skills.stream().collect(Collectors.groupingBy(EmployeeSkill::employeeId));

        List<MlServiceClient.TurnoverBatchItem> turnoverBatch = buildTurnoverBatch(scoped);
        List<FlightRiskResult> flightRisks = ml.computeFlightRiskBatch(scoped);
        List<TurnoverRiskResult> turnoverRisks = ml.computeTurnoverRiskBatch(turnoverBatch);

        Map<String, FlightRiskResult> riskByEmployeeId = flightRisks.stream().collect(Collectors.toMap(FlightRiskResult::employeeId, r -> r));
        Map<String, TurnoverRiskResult> turnoverByEmployeeId = turnoverRisks.stream().collect(Collectors.toMap(TurnoverRiskResult::employeeId, r -> r));

        return scoped.stream()
                .map(e -> enrich(e, skillsByEmployee.getOrDefault(e.id(), List.of()), riskByEmployeeId.get(e.id()), turnoverByEmployeeId.get(e.id())))
                .toList();
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        var profile = CurrentProfile.get();
        Employee employee = data.getEmployeeByProfileId(profile.id())
                .orElseThrow(() -> ApiException.notFound("No employee record linked to this account"));
        List<EmployeeSkill> skills = data.getEmployeeSkills().stream()
                .filter(s -> s.employeeId().equals(employee.id())).toList();

        var turnoverItem = buildTurnoverBatch(List.of(employee)).get(0);
        FlightRiskResult flightRisk = ml.computeFlightRisk(employee, null);
        TurnoverRiskResult turnoverRisk = ml.computeTurnoverRisk(employee.id(), turnoverItem.features());

        return enrich(employee, skills, flightRisk, turnoverRisk);
    }

    /** What-if flight-risk simulation — HR staff only. */
    @PostMapping("/{id}/flight-risk-simulate")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public FlightRiskResult flightRiskSimulate(@PathVariable String id, @RequestBody(required = false) FlightRiskSimulateRequest body) {
        Employee employee = data.getEmployees().stream().filter(e -> e.id().equals(id)).findFirst()
                .orElseThrow(() -> ApiException.notFound("Employee not found"));
        FlightRiskOverrides overrides = body == null ? null
                : new FlightRiskOverrides(body.overtimeHoursMonth(), body.daysSinceVacation(), body.salary());
        return ml.computeFlightRisk(employee, overrides);
    }

    /** "What would reduce this risk?" — minimum single-lever change that drops the employee one band. HR staff only. */
    @GetMapping("/{id}/flight-risk-counterfactuals")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public FlightRiskCounterfactuals flightRiskCounterfactuals(@PathVariable String id) {
        Employee employee = data.getEmployees().stream().filter(e -> e.id().equals(id)).findFirst()
                .orElseThrow(() -> ApiException.notFound("Employee not found"));

        double salaryMin = Math.max(20000, Math.round(employee.salary() * 0.6 / 1000) * 1000);
        double salaryMax = Math.round(employee.salary() * 1.4 / 1000) * 1000;
        RiskBounds bounds = new RiskBounds(
                new double[]{0, 60},
                new double[]{0, 365},
                new double[]{salaryMin, salaryMax}
        );
        return ml.computeFlightRiskCounterfactuals(employee, bounds);
    }
}
