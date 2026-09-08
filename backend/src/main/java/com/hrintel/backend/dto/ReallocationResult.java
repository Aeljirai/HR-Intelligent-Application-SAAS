package com.hrintel.backend.dto;

import java.util.List;

public record ReallocationResult(List<DepartmentLoad> loads, List<ReallocationSuggestion> suggestions) {
    public record DepartmentLoad(String departmentId, String departmentName, int headcount, int openTickets, double ticketsPerEmployee, double loadIndex) {
    }

    public record ReallocationSuggestion(
            String fromDepartmentId,
            String fromDepartmentName,
            String toDepartmentId,
            String toDepartmentName,
            int headcountToMove,
            String urgency,
            String rationale
    ) {
    }
}
