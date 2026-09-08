package com.hrintel.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AnalyzePreviewRequest(@NotBlank @Size(min = 1, max = 4000) String text) {
}
