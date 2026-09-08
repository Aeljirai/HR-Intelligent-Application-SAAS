package com.hrintel.backend.web;

import com.hrintel.backend.dto.CommandRequest;
import com.hrintel.backend.dto.CommandResult;
import com.hrintel.backend.dto.ParsedCommand;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.security.CurrentProfile;
import com.hrintel.backend.service.NlCommandService;
import com.hrintel.backend.service.SupabaseDataService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** A 1:1 port of routes/agent.routes.ts. */
@RestController
@RequestMapping("/api/agent")
public class AgentController {

    private final NlCommandService nlCommandService;
    private final SupabaseDataService data;

    public AgentController(NlCommandService nlCommandService, SupabaseDataService data) {
        this.nlCommandService = nlCommandService;
        this.data = data;
    }

    @PostMapping("/command")
    public Map<String, Object> command(@Valid @RequestBody CommandRequest body) {
        var profile = CurrentProfile.get();
        Employee me = data.getEmployeeByProfileId(profile.id()).orElse(null);

        // Privacy guard runs before intent parsing: own salary/performance/attendance/personal
        // info is answerable, anyone else's is refused immediately, for every role.
        Optional<CommandResult> guarded = nlCommandService.applyPrivacyGuard(body.text(), me);
        if (guarded.isPresent()) {
            Map<String, Object> blockedResponse = new LinkedHashMap<>();
            blockedResponse.put("command", new ParsedCommand("query", "privacy_guard", Map.of(), 1.0, body.text()));
            blockedResponse.put("result", guarded.get());
            return blockedResponse;
        }

        ParsedCommand command = nlCommandService.parseCommand(body.text());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("command", command);

        // Employees get read-only "query" answers; execute/synthesize require HR staff.
        if (!"query".equals(command.intent()) && "employee".equals(profile.role())) {
            response.put("result", new CommandResult("text", "This action requires HR admin or manager access.", null));
            return response;
        }

        var result = nlCommandService.executeCommand(command, data.getEmployees(), data.getDepartments(), data.getTickets());
        response.put("result", result);
        return response;
    }
}
