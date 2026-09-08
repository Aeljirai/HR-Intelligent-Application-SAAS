package com.hrintel.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** ml-service's own field names are camelCase, matching the "what-if" sliders on the frontend. Null fields are omitted, mirroring the JS object literal's undefined-field dropping. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FlightRiskOverrides(
        @JsonProperty("overtimeHoursMonth") Double overtimeHoursMonth,
        @JsonProperty("daysSinceVacation") Double daysSinceVacation,
        @JsonProperty("salary") Double salary
) {
}
