package com.hrintel.backend.dto;

import java.util.List;

public record TurnoverRiskResult(String employeeId, double probability, String band, List<FeatureImportance> featureImportance) {
    public record FeatureImportance(String feature, double importancePct) {
    }
}
