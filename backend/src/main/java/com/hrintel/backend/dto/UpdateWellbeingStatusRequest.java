package com.hrintel.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateWellbeingStatusRequest(
        @NotBlank @Pattern(regexp = "approved|declined|scheduled") String status,
        String scheduledAt,
        @Size(max = 2000) String reviewerNote
) {
}
