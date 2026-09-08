package com.hrintel.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Mirrors the Node backend's {@code cors({ origin: env.corsOrigin, credentials: true })}.
 * Exposed as a {@link CorsConfigurationSource} bean (rather than a
 * WebMvcConfigurer CORS mapping) so SecurityConfig can wire it into Spring
 * Security's own CorsFilter, which runs before every other filter in the
 * chain — including SupabaseAuthFilter — so a preflight OPTIONS request
 * gets its Access-Control-Allow-* headers without ever needing a bearer
 * token.
 */
@Configuration
public class WebConfig {

    private final AppProperties props;

    public WebConfig(AppProperties props) {
        this.props = props;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(props.corsOrigin()));
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
