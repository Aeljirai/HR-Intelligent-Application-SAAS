package com.hrintel.backend.service;

import jakarta.annotation.PostConstruct;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Hand-rolled TF-IDF + cosine-similarity retrieval over the static HR policy
 * documents in resources/policies — no embeddings API. A 1:1 port of
 * lib/policyRetrieval.ts. Built once at startup — the policy corpus is a
 * handful of static files, no need to re-chunk/re-index per request.
 */
@Service
public class PolicyRetrievalService {

    private static final Set<String> STOPWORDS = Set.of(
            "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for",
            "from", "have", "how", "i", "if", "in", "is", "it", "my", "of", "on", "or",
            "that", "the", "this", "to", "what", "when", "will", "with", "you", "your"
    );

    public record PolicyChunk(String id, String docTitle, String heading, String text) {
    }

    public record RetrievedChunk(String docTitle, String heading, String text, double score) {
    }

    private record ChunkVector(PolicyChunk chunk, Map<String, Double> weights, double norm) {
    }

    private Map<String, Double> idf;
    private List<ChunkVector> vectors;

    private static List<String> tokenize(String text) {
        String cleaned = text.toLowerCase().replaceAll("[^a-z0-9\\s]", " ");
        List<String> tokens = new ArrayList<>();
        for (String w : cleaned.split("\\s+")) {
            if (w.length() >= 2 && !STOPWORDS.contains(w)) tokens.add(w);
        }
        return tokens;
    }

    @PostConstruct
    void buildIndex() {
        List<PolicyChunk> chunks = loadPolicyChunks();
        List<List<String>> chunkTokens = chunks.stream()
                .map(c -> tokenize(c.heading() + " " + c.text()))
                .toList();

        Map<String, Integer> docFrequency = new HashMap<>();
        for (List<String> tokens : chunkTokens) {
            for (String term : new HashSet<>(tokens)) {
                docFrequency.merge(term, 1, Integer::sum);
            }
        }

        int n = chunks.size();
        idf = new HashMap<>();
        for (var entry : docFrequency.entrySet()) {
            idf.put(entry.getKey(), Math.log((double) n / (1 + entry.getValue())) + 1);
        }

        vectors = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            Map<String, Integer> termFreq = new HashMap<>();
            for (String term : chunkTokens.get(i)) termFreq.merge(term, 1, Integer::sum);

            Map<String, Double> weights = new HashMap<>();
            for (var entry : termFreq.entrySet()) {
                weights.put(entry.getKey(), entry.getValue() * idf.getOrDefault(entry.getKey(), 0.0));
            }
            double norm = Math.sqrt(weights.values().stream().mapToDouble(w -> w * w).sum());
            vectors.add(new ChunkVector(chunks.get(i), weights, norm));
        }
    }

    private List<PolicyChunk> loadPolicyChunks() {
        List<PolicyChunk> chunks = new ArrayList<>();
        try {
            var resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath:policies/*.md");
            for (Resource resource : resources) {
                String raw = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                String fileName = resource.getFilename();

                Matcher titleMatcher = Pattern.compile("(?m)^#\\s+(.+)$").matcher(raw);
                String docTitle = titleMatcher.find() ? titleMatcher.group(1).trim() : fileName;

                String[] sections = raw.split("(?m)^##\\s+");
                // sections[0] is the part before the first ## heading (the title line) — drop it.
                for (int i = 1; i < sections.length; i++) {
                    String[] lines = sections[i].split("\n", 2);
                    String heading = lines[0].trim();
                    String body = lines.length > 1 ? lines[1].trim() : "";
                    chunks.add(new PolicyChunk(fileName + "#" + heading, docTitle, heading, body));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load policy documents", e);
        }
        return chunks;
    }

    public List<RetrievedChunk> retrieveTopChunks(String query, int k) {
        Map<String, Integer> queryTerms = new HashMap<>();
        for (String term : tokenize(query)) queryTerms.merge(term, 1, Integer::sum);

        Map<String, Double> queryWeights = new HashMap<>();
        for (var entry : queryTerms.entrySet()) {
            queryWeights.put(entry.getKey(), entry.getValue() * idf.getOrDefault(entry.getKey(), 0.0));
        }
        double queryNorm = Math.sqrt(queryWeights.values().stream().mapToDouble(w -> w * w).sum());
        if (queryNorm == 0) return List.of();

        return vectors.stream()
                .map(v -> {
                    if (v.norm() == 0) return new RetrievedChunk(v.chunk().docTitle(), v.chunk().heading(), v.chunk().text(), 0);
                    double dot = 0;
                    for (var entry : queryWeights.entrySet()) {
                        Double cw = v.weights().get(entry.getKey());
                        if (cw != null) dot += entry.getValue() * cw;
                    }
                    return new RetrievedChunk(v.chunk().docTitle(), v.chunk().heading(), v.chunk().text(), dot / (queryNorm * v.norm()));
                })
                .sorted((a, b) -> Double.compare(b.score(), a.score()))
                .limit(k)
                .toList();
    }
}
