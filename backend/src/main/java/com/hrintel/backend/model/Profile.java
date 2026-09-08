package com.hrintel.backend.model;

/**
 * app_role is one of "admin" | "manager" | "employee" — kept as a plain
 * String throughout this codebase (as it is in the TypeScript source, which
 * only ever treats it as a string literal union) rather than a Java enum, to
 * avoid any risk of a serialization mismatch against Postgres/PostgREST.
 */
public record Profile(
        String id,
        String fullName,
        String email,
        String role,
        String departmentId,
        String avatarUrl
) {
    public boolean isHrStaff() {
        return "admin".equals(role) || "manager".equals(role);
    }

    public boolean isAdmin() {
        return "admin".equals(role);
    }
}
