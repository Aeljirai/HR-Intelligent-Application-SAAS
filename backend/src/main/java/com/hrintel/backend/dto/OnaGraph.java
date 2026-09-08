package com.hrintel.backend.dto;

import java.util.List;

public record OnaGraph(List<OnaNode> nodes, List<OnaEdge> edges) {
    public record OnaNode(String id, String fullName, String departmentId, int degree, int crossDepartmentLinks, String role) {
    }

    public record OnaEdge(String source, String target, double weight) {
    }
}
