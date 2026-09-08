package com.hrintel.backend.web;

import com.hrintel.backend.dto.CompensationSandboxRequest;
import com.hrintel.backend.dto.CompensationSandboxResult;
import com.hrintel.backend.dto.OnaGraph;
import com.hrintel.backend.dto.PulseNode;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.model.Ticket;
import com.hrintel.backend.service.MlServiceClient;
import com.hrintel.backend.service.SupabaseDataService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A 1:1 port of routes/analytics.routes.ts — HR staff only, class-wide. */
@RestController
@RequestMapping("/api/analytics")
@PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
public class AnalyticsController {

    private final SupabaseDataService data;
    private final MlServiceClient ml;

    public AnalyticsController(SupabaseDataService data, MlServiceClient ml) {
        this.data = data;
        this.ml = ml;
    }

    @GetMapping("/ona-graph")
    public Map<String, Object> onaGraph() {
        List<Employee> employees = data.getEmployees();
        List<Ticket> tickets = data.getTickets();
        List<Employee> active = employees.stream().filter(e -> "active".equals(e.status())).toList();

        OnaGraph graph = ml.buildOnaGraph(active, data.getProjectMembers());
        List<PulseNode> pulse = ml.computeSentimentPulse(active.stream().map(Employee::id).toList(), tickets, graph);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("nodes", graph.nodes());
        response.put("edges", graph.edges());
        response.put("pulse", pulse);
        return response;
    }

    @PostMapping("/compensation-sandbox")
    public CompensationSandboxResult compensationSandbox(@Valid @RequestBody CompensationSandboxRequest body) {
        return ml.simulateCompensationChange(data.getEmployees(), data.getDepartments(), body.adjustmentPct());
    }
}
