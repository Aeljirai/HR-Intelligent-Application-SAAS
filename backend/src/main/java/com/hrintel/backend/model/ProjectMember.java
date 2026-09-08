package com.hrintel.backend.model;

public record ProjectMember(
        String id,
        String projectId,
        String employeeId,
        String roleOnProject
) {
}
