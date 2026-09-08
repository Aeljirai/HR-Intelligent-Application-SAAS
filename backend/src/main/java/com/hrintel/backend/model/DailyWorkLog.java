package com.hrintel.backend.model;

import java.util.List;

public record DailyWorkLog(
        String id,
        String employeeId,
        String logDate,
        boolean worked,
        String leaveReason,
        double standardHours,
        double overtimeHours,
        List<ProjectAllocation> allocations,
        String createdAt,
        String updatedAt
) {
    public record ProjectAllocation(
            String projectId,
            String projectName,
            double percent,
            double hours
    ) {
    }
}
