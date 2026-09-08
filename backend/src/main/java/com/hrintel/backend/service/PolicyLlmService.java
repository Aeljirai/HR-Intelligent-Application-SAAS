package com.hrintel.backend.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.hrintel.backend.config.AppProperties;
import com.hrintel.backend.exception.PolicyLlmUnavailableException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.net.ConnectException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * The one deliberately non-hand-rolled ML call in this codebase: real
 * generation via a local Ollama server, grounded in the TF-IDF-retrieved
 * policy excerpts from PolicyRetrievalService. A 1:1 port of lib/policyLlm.ts.
 * An unreachable Ollama server degrades this one feature to a clean 503
 * instead of preventing the whole backend from starting.
 */
@Service
public class PolicyLlmService {

    private final WebClient ollama;
    private final AppProperties props;

    public PolicyLlmService(@Qualifier("ollama") WebClient ollama, AppProperties props) {
        this.ollama = ollama;
        this.props = props;
    }

    public record PolicyAnswer(String answer, List<Source> sources) {
        public record Source(String title, String excerpt) {
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record OllamaChatResponse(Message message) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        record Message(String content) {
        }
    }

    public PolicyAnswer answerFromPolicies(String question, List<PolicyRetrievalService.RetrievedChunk> chunks) {
        String context = IntStream.range(0, chunks.size())
                .mapToObj(i -> "[%d] %s — %s\n%s".formatted(i + 1, chunks.get(i).docTitle(), chunks.get(i).heading(), chunks.get(i).text()))
                .collect(Collectors.joining("\n\n"));

        String systemPrompt = "You answer employee HR questions using ONLY the policy excerpts provided below. "
                + "If the excerpts do not cover the question, say so plainly rather than inventing an answer "
                + "or relying on outside knowledge of typical HR policy. Keep answers concise (2-4 sentences) "
                + "and conversational, as if replying in a chat widget.\n\n" + context;

        Map<String, Object> body = Map.of(
                "model", props.ollama().model(),
                "stream", false,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", question)
                )
        );

        OllamaChatResponse response;
        try {
            response = ollama.post().uri("/api/chat").bodyValue(body)
                    .retrieve().bodyToMono(OllamaChatResponse.class).block();
        } catch (WebClientResponseException e) {
            throw new PolicyLlmUnavailableException("Ollama request failed with status " + e.getStatusCode().value());
        } catch (RuntimeException e) {
            if (e.getCause() instanceof ConnectException || e instanceof org.springframework.web.reactive.function.client.WebClientRequestException) {
                throw new PolicyLlmUnavailableException("Could not reach Ollama at " + props.ollama().baseUrl());
            }
            throw e;
        }

        String answer = response != null && response.message() != null ? response.message().content() : "";
        List<PolicyAnswer.Source> sources = chunks.stream()
                .map(c -> new PolicyAnswer.Source(c.docTitle() + " — " + c.heading(), c.text().length() > 220 ? c.text().substring(0, 220) : c.text()))
                .toList();

        return new PolicyAnswer(answer, sources);
    }
}
