package com.hrintel.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** ml-service returns this one shaped camelCase (an inconsistency in the original TS code — see mlClient.ts), unlike its sibling response types. */
public record FlightRiskLeverSuggestion(
        String lever,
        @JsonProperty("currentValue") double currentValue,
        @JsonProperty("suggestedValue") Double suggestedValue,
        @JsonProperty("achievesBand") String achievesBand,
        double[] bounds
) {
}
