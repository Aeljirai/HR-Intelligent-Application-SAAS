package com.hrintel.backend.web;

import com.hrintel.backend.dto.AskPolicyRequest;
import com.hrintel.backend.service.PolicyLlmService;
import com.hrintel.backend.service.PolicyRetrievalService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A 1:1 port of routes/policyCopilot.routes.ts. */
@RestController
@RequestMapping("/api/policy-copilot")
public class PolicyCopilotController {

    private final PolicyRetrievalService retrieval;
    private final PolicyLlmService llm;

    public PolicyCopilotController(PolicyRetrievalService retrieval, PolicyLlmService llm) {
        this.retrieval = retrieval;
        this.llm = llm;
    }

    @PostMapping("/ask")
    public PolicyLlmService.PolicyAnswer ask(@Valid @RequestBody AskPolicyRequest body) {
        var chunks = retrieval.retrieveTopChunks(body.question(), 3);
        return llm.answerFromPolicies(body.question(), chunks);
    }
}
