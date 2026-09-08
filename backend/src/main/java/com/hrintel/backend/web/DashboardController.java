package com.hrintel.backend.web;

import com.hrintel.backend.model.Department;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.service.MlServiceClient;
import com.hrintel.backend.service.SupabaseDataService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
public class DashboardController {

    private final SupabaseDataService data;
    private final MlServiceClient ml;

    public DashboardController(SupabaseDataService data, MlServiceClient ml) {
        this.data = data;
        this.ml = ml;
    }

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        List<Employee> employees = data.getEmployees();
        List<Department> departments = data.getDepartments();
        List<Employee> active = employees.stream().filter(e -> "active".equals(e.status())).toList();

        double avgPerformance = average(active.stream().mapToDouble(Employee::performanceScore).toArray());
        double avgTenureYears = average(active.stream().mapToDouble(this::tenureYears).toArray());

        return Map.of(
                "headcount", active.size(),
                "departments", departments.size(),
                "avg_performance", round(avgPerformance),
                "avg_tenure_years", round(avgTenureYears),
                "open_positions_estimate", Math.max(0, Math.round(active.size() * 0.04))
        );
    }

    @GetMapping("/anomalies")
    public Object anomalies() {
        List<Employee> employees = data.getEmployees();
        List<Department> departments = data.getDepartments();
        return ml.detectAttendanceAnomalies(data.getAttendance(null), employees, departments);
    }

    @GetMapping("/headcount-forecast")
    public Object headcountForecast(@RequestParam(name = "months", required = false, defaultValue = "6") int months) {
        return ml.forecastHeadcount(data.getEmployees(), months);
    }

    private double tenureYears(Employee e) {
        long hireMillis = Instant.parse(e.hireDate().length() <= 10 ? e.hireDate() + "T00:00:00Z" : e.hireDate()).toEpochMilli();
        return (Instant.now().toEpochMilli() - hireMillis) / (365.25 * 86_400_000);
    }

    private double average(double[] nums) {
        return nums.length == 0 ? 0 : java.util.Arrays.stream(nums).average().orElse(0);
    }

    private double round(double n) {
        return Math.round(n * 100) / 100.0;
    }
}
