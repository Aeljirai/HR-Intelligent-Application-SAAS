package com.hrintel.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The 9-feature input ml-service's turnover Random Forest expects (see
 * ml-service/src/ml/turnoverFeatureSchema.ts). Unlike the Supabase-facing
 * models in the `model` package, ml-service's own schema is camelCase, so
 * every field here is pinned with @JsonProperty against the app-wide
 * snake_case Jackson naming strategy.
 */
public record TurnoverFeatures(
        @JsonProperty("satisfactionLevel") double satisfactionLevel,
        @JsonProperty("lastEvaluation") double lastEvaluation,
        @JsonProperty("numberProject") int numberProject,
        @JsonProperty("averageMonthlyHours") int averageMonthlyHours,
        @JsonProperty("timeSpendCompany") int timeSpendCompany,
        @JsonProperty("workAccident") int workAccident,
        @JsonProperty("promotionLast5Years") int promotionLast5Years,
        @JsonProperty("department") String department,
        @JsonProperty("salaryBucket") int salaryBucket
) {
}
