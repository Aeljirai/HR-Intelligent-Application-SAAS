package com.hrintel.backend.dto;

import java.util.List;

public record FlightRiskResult(String employeeId, double score, String band, List<FlightRiskFactor> factors) {
}
