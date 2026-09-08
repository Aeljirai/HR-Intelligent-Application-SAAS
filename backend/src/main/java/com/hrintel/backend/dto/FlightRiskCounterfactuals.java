package com.hrintel.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record FlightRiskCounterfactuals(
        String employeeId,
        @JsonProperty("currentBand") String currentBand,
        List<FlightRiskLeverSuggestion> suggestions
) {
}
