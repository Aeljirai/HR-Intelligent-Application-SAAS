package com.hrintel.backend.dto;

public record AttendanceAnomaly(
        String departmentId,
        String departmentName,
        String windowStart,
        String windowEnd,
        String metric,
        double rate,
        double baselineRate,
        double zScore,
        String severity
) {
}
