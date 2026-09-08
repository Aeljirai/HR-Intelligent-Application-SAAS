package com.hrintel.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateTicketStatusRequest(
        @NotBlank @Pattern(regexp = "open|in_progress|escalated|resolved|auto_resolved") String status,
        @Size(max = 4000) String resolutionNote
) {
}
