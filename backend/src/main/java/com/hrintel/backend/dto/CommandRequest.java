package com.hrintel.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CommandRequest(@NotBlank @Size(min = 1, max = 500) String text) {
}
