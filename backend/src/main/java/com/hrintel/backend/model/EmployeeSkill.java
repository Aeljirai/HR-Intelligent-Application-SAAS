package com.hrintel.backend.model;

public record EmployeeSkill(
        String id,
        String employeeId,
        String skillName,
        int proficiency
) {
}
