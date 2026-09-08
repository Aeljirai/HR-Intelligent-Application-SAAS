package com.hrintel.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AskPolicyRequest(@NotBlank @Size(min = 3, max = 1000) String question) {
}
