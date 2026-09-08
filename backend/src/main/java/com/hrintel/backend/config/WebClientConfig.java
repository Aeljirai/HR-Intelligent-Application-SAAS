package com.hrintel.backend.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.codec.json.Jackson2JsonDecoder;
import org.springframework.http.codec.json.Jackson2JsonEncoder;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Named WebClient beans, one per downstream HTTP dependency. Mirrors the four
 * places the old Node backend made outbound HTTP calls: the Supabase REST
 * (PostgREST) API via the service-role key, the Supabase Auth API (used both
 * to verify a caller's access token and, from the seed runner, to manage demo
 * users), the ml-service microservice, and a local Ollama server.
 *
 * WebClient.builder() does NOT inherit the Spring-managed, customized
 * ObjectMapper (the one JacksonConfig applies the snake_case naming strategy
 * to) — it builds its own default-configured Jackson codecs unless told
 * otherwise. Every client here is wired explicitly to the app's ObjectMapper
 * bean so inbound JSON (Supabase rows, ml-service responses) deserializes
 * with the same snake_case mapping the frontend-facing responses use.
 */
@Configuration
public class WebClientConfig {

    private final ObjectMapper objectMapper;

    public WebClientConfig(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    private WebClient.Builder baseBuilder() {
        return WebClient.builder()
                .codecs(configurer -> {
                    configurer.defaultCodecs().jackson2JsonEncoder(new Jackson2JsonEncoder(objectMapper));
                    configurer.defaultCodecs().jackson2JsonDecoder(new Jackson2JsonDecoder(objectMapper));
                });
    }

    @Bean
    @Qualifier("supabaseRest")
    public WebClient supabaseRestWebClient(AppProperties props) {
        var supabase = props.supabase();
        return baseBuilder()
                .baseUrl(supabase.url() + "/rest/v1")
                .defaultHeader("apikey", supabase.serviceRoleKey())
                .defaultHeader("Authorization", "Bearer " + supabase.serviceRoleKey())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    /** No default auth headers — auth verification uses the anon key, admin user management uses the service-role key. */
    @Bean
    @Qualifier("supabaseAuth")
    public WebClient supabaseAuthWebClient(AppProperties props) {
        return baseBuilder()
                .baseUrl(props.supabase().url() + "/auth/v1")
                .build();
    }

    @Bean
    @Qualifier("mlService")
    public WebClient mlServiceWebClient(AppProperties props) {
        return baseBuilder()
                .baseUrl(props.mlServiceUrl())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    @Bean
    @Qualifier("ollama")
    public WebClient ollamaWebClient(AppProperties props) {
        return baseBuilder()
                .baseUrl(props.ollama().baseUrl())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }
}
