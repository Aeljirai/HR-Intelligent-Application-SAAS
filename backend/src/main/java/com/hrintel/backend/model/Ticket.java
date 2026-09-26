package com.hrintel.backend.model;

public record Ticket(
        String id,
        String employeeId,
        String subject,
        String description,
        String category,
        String sentimentLabel,
        Double sentimentScore,
        String urgency,
        String status,
        boolean tier0Resolved,
        String resolutionNote,
        String createdAt,
        String resolvedAt,
        String assignedTo
) {
}
