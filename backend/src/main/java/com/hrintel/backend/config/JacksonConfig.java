package com.hrintel.backend.config;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Postgres columns, PostgREST JSON, and the frontend's TypeScript types are
 * all snake_case (full_name, department_id, ...). Rather than annotate every
 * field with @JsonProperty, serialize/deserialize every Java camelCase field
 * as snake_case globally.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer snakeCaseCustomizer() {
        return builder -> builder.propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
    }
}
