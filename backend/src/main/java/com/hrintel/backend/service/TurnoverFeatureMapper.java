package com.hrintel.backend.service;

import com.hrintel.backend.dto.TurnoverFeatures;
import com.hrintel.backend.model.AttendanceRecord;
import com.hrintel.backend.model.Department;
import com.hrintel.backend.model.Employee;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Derives the 9-feature input ml-service's turnover Random Forest expects
 * from this app's own schema — a 1:1 port of lib/turnoverFeatures.ts.
 * ml-service has no Supabase access and no knowledge of this app's
 * department names or salary scale, so that mapping lives here.
 */
@Service
public class TurnoverFeatureMapper {

    // This app's 8 seeded department names -> the closest of the training
    // dataset's 10 category names. Kaggle's 'IT' and 'RandD' have no
    // equivalent department in this app and are simply never produced.
    private static final Map<String, String> DEPARTMENT_MAP = Map.of(
            "Engineering", "technical",
            "Product", "product_mng",
            "Sales", "sales",
            "Marketing", "marketing",
            "Customer Support", "support",
            "Human Resources", "hr",
            "Finance", "accounting",
            "Operations", "management"
    );

    private static final double SALARY_LOW_MAX = 75_000;
    private static final double SALARY_MEDIUM_MAX = 120_000;
    private static final double AVG_WEEKDAYS_PER_MONTH = 21.7;

    public String mapDepartment(String name) {
        return name == null ? "management" : DEPARTMENT_MAP.getOrDefault(name, "management");
    }

    public int bucketSalary(double salary) {
        return salary < SALARY_LOW_MAX ? 0 : salary <= SALARY_MEDIUM_MAX ? 1 : 2;
    }

    private double yearsSince(String dateStr) {
        long millis = Instant.now().toEpochMilli() - Instant.parse(toInstantString(dateStr)).toEpochMilli();
        return millis / (1000.0 * 60 * 60 * 24 * 365.25);
    }

    /** hire_date is a bare date (e.g. "2023-05-01"); make it a valid instant string. */
    private String toInstantString(String dateStr) {
        return dateStr.length() <= 10 ? dateStr + "T00:00:00Z" : dateStr;
    }

    /** recentAttendance should already be filtered to this employee's rows from roughly the last 30 days. */
    public TurnoverFeatures deriveTurnoverFeatures(
            Employee employee,
            List<AttendanceRecord> recentAttendance,
            int projectCount,
            Map<String, Department> departmentsById
    ) {
        double baseMonthlyHours;
        if (recentAttendance.size() >= 10) {
            baseMonthlyHours = recentAttendance.stream().mapToDouble(AttendanceRecord::hoursWorked).sum();
        } else if (!recentAttendance.isEmpty()) {
            double avgDaily = recentAttendance.stream().mapToDouble(AttendanceRecord::hoursWorked).average().orElse(0);
            baseMonthlyHours = avgDaily * AVG_WEEKDAYS_PER_MONTH;
        } else {
            baseMonthlyHours = 160; // neutral full-time baseline for a brand-new hire with no attendance yet
        }
        // Kaggle's average_montly_hours already bakes in overtime; this app tracks
        // base attendance hours and overtime as separate fields, so combine them.
        int averageMonthlyHours = (int) Math.round(baseMonthlyHours + employee.overtimeHoursMonth());

        String departmentName = employee.departmentId() != null && departmentsById.containsKey(employee.departmentId())
                ? departmentsById.get(employee.departmentId()).name()
                : null;

        return new TurnoverFeatures(
                employee.satisfactionLevel(),
                employee.performanceScore() / 100,
                projectCount,
                averageMonthlyHours,
                (int) Math.round(yearsSince(employee.hireDate())),
                employee.workAccident() ? 1 : 0,
                employee.promotionLast5years() ? 1 : 0,
                mapDepartment(departmentName),
                bucketSalary(employee.salary())
        );
    }
}
