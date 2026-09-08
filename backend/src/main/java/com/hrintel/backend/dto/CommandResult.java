package com.hrintel.backend.dto;

/** kind is one of "action_confirmation" | "chart" | "text". */
public record CommandResult(String kind, String message, Object payload) {
}
