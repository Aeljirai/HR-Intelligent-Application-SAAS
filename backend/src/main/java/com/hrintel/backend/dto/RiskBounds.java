package com.hrintel.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** [min, max] bounds per lever for the flight-risk counterfactuals search — ml-service field names are camelCase. */
public record RiskBounds(
        @JsonProperty("overtimeHoursMonth") double[] overtimeHoursMonth,
        @JsonProperty("daysSinceVacation") double[] daysSinceVacation,
        @JsonProperty("salary") double[] salary
) {
}
