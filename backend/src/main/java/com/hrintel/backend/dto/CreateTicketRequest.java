package com.hrintel.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateTicketRequest(
        @NotBlank @Size(min = 3, max = 200) String subject,
        @NotBlank @Size(min = 3, max = 4000) String description,
        String employeeId // HR staff may file on behalf of someone; optional
) {
}
