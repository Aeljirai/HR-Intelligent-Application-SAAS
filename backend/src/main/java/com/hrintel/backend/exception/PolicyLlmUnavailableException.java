package com.hrintel.backend.exception;

/** The Ollama server is unreachable, misconfigured, or returned an error — mapped to a clean 503 rather than failing the whole request pipeline. */
public class PolicyLlmUnavailableException extends RuntimeException {
    public PolicyLlmUnavailableException(String message) {
        super(message);
    }
}
