package com.hrintel.backend.model;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Dates (hire_date, termination_date) and timestamps are kept as the raw ISO
 * strings PostgREST returns, exactly as the TypeScript `Employee` type does —
 * this backend is a thin passthrough over Supabase's REST API, not an ORM.
 */
public record Employee(
        String id,
        String profileId,
        String fullName,
        String email,
        String departmentId,
        String jobTitle,
        String seniority,
        String hireDate,
        String terminationDate,
        double salary,
        double marketSalary,
        double performanceScore,
        double ptoBalance,
        double ptoUsedYtd,
        String managerId,
        String status,
        String contractType,
        String region,
        Double lat,
        Double lng,
        double overtimeHoursMonth,
        int daysSinceVacation,
        double satisfactionLevel,
        boolean workAccident,
        @JsonProperty("promotion_last_5years") boolean promotionLast5years
) {
}
