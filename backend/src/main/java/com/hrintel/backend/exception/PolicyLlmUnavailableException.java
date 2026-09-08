package com.hrintel.backend.exception;

/** Ollama is unreachable or returned a non-2xx — mapped to a clean 503 rather than failing the whole request pipeline. */
public class PolicyLlmUnavailableException extends RuntimeException {
    public PolicyLlmUnavailableException(String message) {
        super(message);
    }
}
