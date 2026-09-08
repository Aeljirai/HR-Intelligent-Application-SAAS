package com.hrintel.backend.model;

public record Project(
        String id,
        String name,
        String departmentId,
        String status,
        String startDate,
        String endDate
) {
}
