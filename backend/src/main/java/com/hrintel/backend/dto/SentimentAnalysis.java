package com.hrintel.backend.dto;

public record SentimentAnalysis(
        SentimentResult sentiment,
        String urgency,
        String category,
        RoutingDecision routing,
        Tier0Result tier0
) {
    public record SentimentResult(String label, double score) {
    }

    public record RoutingDecision(boolean escalate, String queue, String reason) {
    }

    public record Tier0Result(boolean resolved, String note) {
    }
}
