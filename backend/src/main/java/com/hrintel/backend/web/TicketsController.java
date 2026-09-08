package com.hrintel.backend.web;

import com.hrintel.backend.dto.AnalyzePreviewRequest;
import com.hrintel.backend.dto.CreateTicketRequest;
import com.hrintel.backend.dto.SentimentAnalysis;
import com.hrintel.backend.dto.UpdateTicketStatusRequest;
import com.hrintel.backend.exception.ApiException;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.model.Ticket;
import com.hrintel.backend.security.CurrentProfile;
import com.hrintel.backend.service.MlServiceClient;
import com.hrintel.backend.service.SupabaseDataService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A 1:1 port of routes/tickets.routes.ts. */
@RestController
@RequestMapping("/api/tickets")
public class TicketsController {

    private final SupabaseDataService data;
    private final MlServiceClient ml;

    public TicketsController(SupabaseDataService data, MlServiceClient ml) {
        this.data = data;
        this.ml = ml;
    }

    @GetMapping
    public List<Ticket> list() {
        var profile = CurrentProfile.get();
        List<Ticket> all = data.getTickets();
        if (profile.isHrStaff()) return all;

        return data.getEmployeeByProfileId(profile.id())
                .map(me -> all.stream().filter(t -> t.employeeId().equals(me.id())).toList())
                .orElse(List.of());
    }

    /**
     * Runs the ticket through the NLP pipeline synchronously on submit:
     * sentiment -> urgency -> category -> routing decision -> Tier-0 attempt.
     * This is the same logic the frontend runs client-side for the live
     * "New Request" composer preview, kept here as the source of truth that
     * actually persists.
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody CreateTicketRequest body) {
        var profile = CurrentProfile.get();

        String employeeId = body.employeeId();
        if ("employee".equals(profile.role()) || employeeId == null) {
            Employee me = data.getEmployeeByProfileId(profile.id())
                    .orElseThrow(() -> ApiException.notFound("No employee record linked to this account"));
            employeeId = me.id();
        }

        Employee employee = data.getEmployeeById(employeeId)
                .orElseThrow(() -> ApiException.notFound("Employee not found"));

        String fullText = body.subject() + ". " + body.description();
        SentimentAnalysis analysis = ml.analyzeTicketText(fullText, employee);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("employee_id", employeeId);
        fields.put("subject", body.subject());
        fields.put("description", body.description());
        fields.put("category", analysis.category());
        fields.put("sentiment_label", analysis.sentiment().label());
        fields.put("sentiment_score", analysis.sentiment().score());
        fields.put("urgency", analysis.urgency());
        fields.put("status", analysis.tier0().resolved() ? "auto_resolved" : analysis.routing().escalate() ? "escalated" : "open");
        fields.put("tier0_resolved", analysis.tier0().resolved());
        fields.put("resolution_note", analysis.tier0().note());
        fields.put("resolved_at", analysis.tier0().resolved() ? Instant.now().toString() : null);

        Ticket ticket = data.insertTicket(fields);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ticket", ticket);
        response.put("sentiment", analysis.sentiment());
        response.put("urgency", analysis.urgency());
        response.put("category", analysis.category());
        response.put("routing", analysis.routing());
        response.put("tier0", analysis.tier0());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Ticket updateStatus(@PathVariable String id, @Valid @RequestBody UpdateTicketStatusRequest body) {
        boolean resolved = body.status().equals("resolved") || body.status().equals("auto_resolved");
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("status", body.status());
        fields.put("resolution_note", body.resolutionNote());
        fields.put("resolved_at", resolved ? Instant.now().toString() : null);
        return data.updateTicketStatus(id, fields);
    }

    /** Live preview endpoint for the ticket composer — analyzes without saving. */
    @PostMapping("/analyze-preview")
    public Map<String, Object> analyzePreview(@Valid @RequestBody AnalyzePreviewRequest body) {
        SentimentAnalysis analysis = ml.analyzeTicketText(body.text(), null);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("sentiment", analysis.sentiment());
        response.put("urgency", analysis.urgency());
        response.put("category", analysis.category());
        response.put("routing", analysis.routing());
        return response;
    }
}
