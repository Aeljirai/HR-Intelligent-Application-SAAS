package com.hrintel.backend.model;

public record WellbeingRequest(
        String id,
        String employeeId,
        String type,
        String clubId,
        String note,
        String status,
        String scheduledAt,
        String reviewedBy,
        String reviewerNote,
        String createdAt,
        String updatedAt
) {
}
