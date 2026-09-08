package com.hrintel.backend.dto;

import java.util.List;

public record CompensationSandboxResult(
        double adjustmentPct,
        double totalCurrent,
        double totalAdjusted,
        double totalDelta,
        List<ByDepartment> byDepartment,
        List<ByEmployee> byEmployee
) {
    public record ByDepartment(String departmentId, String departmentName, int headcount, double currentPayroll, double adjustedPayroll, double delta) {
    }

    public record ByEmployee(String employeeId, String fullName, double current, double adjusted) {
    }
}
