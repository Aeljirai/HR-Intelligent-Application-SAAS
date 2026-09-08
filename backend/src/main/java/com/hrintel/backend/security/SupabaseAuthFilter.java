package com.hrintel.backend.security;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hrintel.backend.config.AppProperties;
import com.hrintel.backend.model.Profile;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Verifies the `Authorization: Bearer <access_token>` header issued by
 * Supabase Auth on the frontend, then loads the matching row from
 * `profiles` (which carries our app-level role: admin / manager / employee).
 *
 * Port of backend/src/middleware/auth.ts#requireAuth: the anon client
 * validates the JWT (a round-trip to Supabase's own auth server, exactly
 * what its gateway does), then the service-role client reads the profile,
 * bypassing RLS since role checks happen here instead. Every route in this
 * app sits under requireAuth (see the original routers), so this filter
 * enforces auth uniformly for all of /api/** and leaves /health public.
 */
@Component
public class SupabaseAuthFilter extends OncePerRequestFilter {

    private final WebClient supabaseAuthClient;
    private final WebClient supabaseRestClient;
    private final AppProperties props;
    private final ObjectMapper objectMapper;

    public SupabaseAuthFilter(
            @Qualifier("supabaseAuth") WebClient supabaseAuthClient,
            @Qualifier("supabaseRest") WebClient supabaseRestClient,
            AppProperties props,
            ObjectMapper objectMapper
    ) {
        this.supabaseAuthClient = supabaseAuthClient;
        this.supabaseRestClient = supabaseRestClient;
        this.props = props;
        this.objectMapper = objectMapper;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record SupabaseAuthUser(String id) {
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // CORS preflight requests never carry Authorization — Spring Security's CorsFilter
        // (see SecurityConfig) is meant to short-circuit these before this filter runs at
        // all, but skip explicitly too so a filter-ordering change can't reintroduce a
        // "preflight gets 401, browser reports a CORS failure" regression.
        if ("OPTIONS".equalsIgnoreCase(request.getMethod()) || !request.getRequestURI().startsWith("/api/")) {
            filterChain.doFilter(request, response);
            return;
        }

        String header = request.getHeader("Authorization");
        String token = (header != null && header.startsWith("Bearer ")) ? header.substring(7) : null;
        if (token == null) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "Missing bearer token");
            return;
        }

        SupabaseAuthUser user;
        try {
            user = supabaseAuthClient.get()
                    .uri("/user")
                    .header("Authorization", "Bearer " + token)
                    .header("apikey", props.supabase().anonKey())
                    .retrieve()
                    .bodyToMono(SupabaseAuthUser.class)
                    .block();
        } catch (RuntimeException e) {
            user = null;
        }
        if (user == null || user.id() == null) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "Invalid or expired session");
            return;
        }
        final String userId = user.id();

        List<Map<String, Object>> profiles;
        try {
            profiles = supabaseRestClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/profiles")
                            .queryParam("id", "eq." + userId)
                            .queryParam("select", "id,full_name,email,role,department_id,avatar_url")
                            .build())
                    .retrieve()
                    .bodyToMono(new org.springframework.core.ParameterizedTypeReference<List<Map<String, Object>>>() {
                    })
                    .block();
        } catch (RuntimeException e) {
            profiles = List.of();
        }

        if (profiles == null || profiles.isEmpty()) {
            writeError(response, HttpServletResponse.SC_FORBIDDEN, "No HR profile found for this account");
            return;
        }

        Profile profile = objectMapper.convertValue(profiles.get(0), Profile.class);
        var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + profile.role().toUpperCase()));
        var authentication = new UsernamePasswordAuthenticationToken(profile, null, authorities);
        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(objectMapper.writeValueAsString(Map.of("error", message)));
    }
}
