package com.hrintel.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds the same env var names backend/.env.example has always used (see
 * application.yml for the mapping) so local dev/.env/docker-compose need no
 * changes from the Node backend.
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String corsOrigin,
        Supabase supabase,
        String mlServiceUrl,
        Ollama ollama,
        Seed seed
) {
    public record Supabase(String url, String anonKey, String serviceRoleKey) {
    }

    public record Ollama(String baseUrl, String model) {
    }

    public record Seed(String adminPassword, String employeePassword) {
    }
}
