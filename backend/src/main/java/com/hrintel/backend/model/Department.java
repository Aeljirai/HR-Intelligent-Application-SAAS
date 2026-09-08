package com.hrintel.backend.model;

public record Department(
        String id,
        String name,
        String region,
        double budget,
        double kpiCompletion,
        double outputScore,
        String managerEmployeeId
) {
}
