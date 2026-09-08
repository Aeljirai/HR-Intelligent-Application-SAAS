package com.hrintel.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateWellbeingRequest(
        @NotBlank @Pattern(regexp = "club_join|psychiatric_support") String type,
        String clubId,
        @Size(max = 2000) String note
) {
}
