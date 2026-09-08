package com.hrintel.backend.web;

import com.hrintel.backend.dto.ReallocationResult;
import com.hrintel.backend.model.Department;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.service.MlServiceClient;
import com.hrintel.backend.service.SupabaseDataService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** A 1:1 port of routes/departments.routes.ts. */
@RestController
@RequestMapping("/api/departments")
public class DepartmentsController {

    private final SupabaseDataService data;
    private final MlServiceClient ml;

    public DepartmentsController(SupabaseDataService data, MlServiceClient ml) {
        this.data = data;
        this.ml = ml;
    }

    @GetMapping
    public List<Department> list() {
        return data.getDepartments();
    }

    @GetMapping("/budget-heatmap")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public List<Map<String, Object>> budgetHeatmap() {
        List<Department> departments = data.getDepartments();
        List<Employee> employees = data.getEmployees();

        return departments.stream().map(d -> {
            List<Employee> active = employees.stream()
                    .filter(e -> d.id().equals(e.departmentId()) && "active".equals(e.status())).toList();
            int headcount = active.size();
            double payroll = active.stream().mapToDouble(Employee::salary).sum();
            double utilization = d.budget() > 0 ? Math.round((payroll / d.budget()) * 1000) / 10.0 : 0;
            double efficiencyScore = Math.round(((d.kpiCompletion() + d.outputScore()) / 2) * 10) / 10.0;

            return Map.<String, Object>of(
                    "department_id", d.id(),
                    "department_name", d.name(),
                    "budget", d.budget(),
                    "payroll", payroll,
                    "utilization_pct", utilization,
                    "kpi_completion", d.kpiCompletion(),
                    "output_score", d.outputScore(),
                    "efficiency_score", efficiencyScore,
                    "headcount", headcount
            );
        }).toList();
    }

    @GetMapping("/reallocation")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ReallocationResult reallocation() {
        return ml.computeReallocation(data.getDepartments(), data.getEmployees(), data.getTickets());
    }
}
