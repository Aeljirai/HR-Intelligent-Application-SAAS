package com.hrintel.backend.dto;

import java.util.Map;

public record ParsedCommand(String intent, String action, Map<String, String> entities, double confidence, String rawText) {
}
