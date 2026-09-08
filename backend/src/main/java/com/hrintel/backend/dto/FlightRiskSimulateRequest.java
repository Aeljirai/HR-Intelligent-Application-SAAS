package com.hrintel.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Mirrors the raw `req.body` destructuring in the old route — the frontend's what-if sliders send these camelCase, matching ml-service's own FlightRiskOverrides shape. */
public record FlightRiskSimulateRequest(
        @JsonProperty("overtimeHoursMonth") Double overtimeHoursMonth,
        @JsonProperty("daysSinceVacation") Double daysSinceVacation,
        @JsonProperty("salary") Double salary
) {
}
