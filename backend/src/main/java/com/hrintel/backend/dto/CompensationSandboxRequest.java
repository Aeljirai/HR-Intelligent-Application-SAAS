package com.hrintel.backend.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

public record CompensationSandboxRequest(@DecimalMin("-10") @DecimalMax("15") double adjustmentPct) {
}
