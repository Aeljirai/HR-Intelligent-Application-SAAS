package com.hrintel.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PolicyRetrievalServiceTest {

    private final PolicyRetrievalService service = new PolicyRetrievalService();

    @BeforeEach
    void setUp() {
        service.buildIndex();
    }

    @Test
    void ranksTheMostRelevantChunkFirst() {
        List<PolicyRetrievalService.RetrievedChunk> results = service.retrieveTopChunks("how many vacation days do I accrue per year", 3);

        assertThat(results).isNotEmpty();
        assertThat(results.get(0).docTitle().toLowerCase()).contains("pto");
        // scores should be sorted descending
        for (int i = 1; i < results.size(); i++) {
            assertThat(results.get(i - 1).score()).isGreaterThanOrEqualTo(results.get(i).score());
        }
    }

    @Test
    void returnsNothingForAnEmptyQuery() {
        assertThat(service.retrieveTopChunks("", 3)).isEmpty();
    }
}
