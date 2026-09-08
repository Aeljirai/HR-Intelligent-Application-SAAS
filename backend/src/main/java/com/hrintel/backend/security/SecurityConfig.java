package com.hrintel.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import java.util.Map;

/**
 * Authentication itself is handled entirely by {@link SupabaseAuthFilter}
 * (which writes 401/403 directly, matching the old Express middleware);
 * this config wires that filter into the chain, keeps the app stateless, and
 * enables @PreAuthorize so role gates (the old requireHrStaff/requireRole)
 * can be expressed as method security on controllers.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            SupabaseAuthFilter supabaseAuthFilter,
            ObjectMapper objectMapper,
            CorsConfigurationSource corsConfigurationSource
    ) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                // Spring Security's own CorsFilter runs ahead of every other filter in
                // this chain (SupabaseAuthFilter included), so a CORS preflight OPTIONS
                // request gets its Access-Control-Allow-* headers and a 200 without ever
                // needing a bearer token — the browser never sends one on preflight.
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .addFilterBefore(supabaseAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(eh -> eh
                        .authenticationEntryPoint((request, response, ex) -> {
                            response.setStatus(401);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.getWriter().write(objectMapper.writeValueAsString(Map.of("error", "Not authenticated")));
                        })
                        .accessDeniedHandler((request, response, ex) -> {
                            response.setStatus(403);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.getWriter().write(objectMapper.writeValueAsString(Map.of("error", "Forbidden: insufficient role")));
                        })
                );
        return http.build();
    }
}
