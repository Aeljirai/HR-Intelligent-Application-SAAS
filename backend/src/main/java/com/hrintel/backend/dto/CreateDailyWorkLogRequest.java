package com.hrintel.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record CreateDailyWorkLogRequest(
        @NotBlank String logDate,
        @NotNull Boolean worked,
        String leaveReason,
        @NotNull @DecimalMin("0.0") @DecimalMax("24.0") Double standardHours,
        @NotNull @DecimalMin("0.0") @DecimalMax("24.0") Double overtimeHours,
        @Valid List<AllocationInput> allocations
) {
    public record AllocationInput(
            String projectId,
            @NotBlank String projectName,
            @NotNull @DecimalMin("0.0") @DecimalMax("100.0") Double percent,
            @NotNull @DecimalMin("0.0") @DecimalMax("24.0") Double hours
    ) {
    }
}
