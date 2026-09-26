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
import java.util.Set;

/** A 1:1 port of routes/tickets.routes.ts. */
@RestController
@RequestMapping("/api/tickets")
public class TicketsController {

    private static final List<String> URGENCY_RANK = List.of("low", "medium", "high", "critical");
    private static final Set<String> VALID_CATEGORIES = Set.of("pto", "benefits", "payroll", "it", "facilities", "conduct", "other");

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

        if (body.category() != null && !VALID_CATEGORIES.contains(body.category())) {
            throw ApiException.badRequest("Unknown ticket category: " + body.category());
        }
        if (body.priority() != null && !URGENCY_RANK.contains(body.priority())) {
            throw ApiException.badRequest("Unknown ticket priority: " + body.priority());
        }

        String fullText = body.subject() + ". " + body.description();
        SentimentAnalysis analysis = ml.analyzeTicketText(fullText, employee);

        // The employee picks a type + priority in the composer; the NLP pass still
        // runs on the raw text so a mislabeled ticket can't suppress a safety-critical
        // auto-escalation (e.g. conduct/harassment content, or a "critical" keyword hit).
        String finalCategory = body.category() != null ? body.category() : analysis.category();
        String finalUrgency = higherUrgency(body.priority(), analysis.urgency());
        boolean conductFlagged = "conduct".equals(finalCategory) || "conduct".equals(analysis.category());
        boolean escalate = "critical".equals(finalUrgency)
                || conductFlagged
                || ("high".equals(finalUrgency) && "negative".equals(analysis.sentiment().label()));

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("employee_id", employeeId);
        fields.put("subject", body.subject());
        fields.put("description", body.description());
        fields.put("category", finalCategory);
        fields.put("sentiment_label", analysis.sentiment().label());
        fields.put("sentiment_score", analysis.sentiment().score());
        fields.put("urgency", finalUrgency);
        fields.put("status", analysis.tier0().resolved() ? "auto_resolved" : escalate ? "escalated" : "open");
        fields.put("tier0_resolved", analysis.tier0().resolved());
        fields.put("resolution_note", analysis.tier0().note());
        fields.put("resolved_at", analysis.tier0().resolved() ? Instant.now().toString() : null);
        fields.put("assigned_to", employee.managerId());

        Ticket ticket = data.insertTicket(fields);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ticket", ticket);
        response.put("sentiment", analysis.sentiment());
        response.put("urgency", finalUrgency);
        response.put("category", finalCategory);
        response.put("routing", analysis.routing());
        response.put("tier0", analysis.tier0());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /** Never lets a manual priority pick downgrade what the NLP pass already detected. */
    private static String higherUrgency(String manual, String detected) {
        if (manual == null) return detected;
        return URGENCY_RANK.indexOf(manual) >= URGENCY_RANK.indexOf(detected) ? manual : detected;
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
