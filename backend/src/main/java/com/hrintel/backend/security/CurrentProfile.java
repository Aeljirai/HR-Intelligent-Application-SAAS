package com.hrintel.backend.security;

import com.hrintel.backend.exception.ApiException;
import com.hrintel.backend.model.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;

/** Reads the {@link Profile} that {@link SupabaseAuthFilter} attached to the current request — mirrors `req.profile` in the old Express middleware. */
public final class CurrentProfile {

    private CurrentProfile() {
    }

    public static Profile get() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof Profile profile)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        return profile;
    }
}
