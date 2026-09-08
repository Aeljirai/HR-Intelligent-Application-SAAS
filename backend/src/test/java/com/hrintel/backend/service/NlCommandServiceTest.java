package com.hrintel.backend.service;

import com.hrintel.backend.dto.ParsedCommand;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Port of backend/scripts/smoke-test-agent.ts — a zero-dependency sanity
 * check for NL command parsing, expressed as a JUnit test rather than a
 * standalone CLI script.
 */
class NlCommandServiceTest {

    private final NlCommandService service = new NlCommandService(null);

    @Test
    void parsesApproveLeaveCommand() {
        ParsedCommand cmd = service.parseCommand("Approve all pending leave requests for Engineering");
        assertThat(cmd.intent()).isEqualTo("execute");
        assertThat(cmd.action()).isEqualTo("approve_pending_leave");
        assertThat(cmd.entities().get("department")).isEqualTo("Engineering");
    }

    @Test
    void parsesCompensationGapCommand() {
        ParsedCommand cmd = service.parseCommand("Show compensation gap");
        assertThat(cmd.intent()).isEqualTo("synthesize");
        assertThat(cmd.action()).isEqualTo("compensation_gap");
    }

    @Test
    void parsesDepartmentHeadcountCommand() {
        ParsedCommand cmd = service.parseCommand("How many employees are in Sales?");
        assertThat(cmd.intent()).isEqualTo("query");
        assertThat(cmd.action()).isEqualTo("department_headcount");
    }

    @Test
    void parsesOpenTicketsCountCommand() {
        ParsedCommand cmd = service.parseCommand("How many open tickets are there?");
        assertThat(cmd.intent()).isEqualTo("query");
        assertThat(cmd.action()).isEqualTo("open_tickets_count");
    }

    @Test
    void fallsBackToLowConfidenceUnknown() {
        ParsedCommand cmd = service.parseCommand("what is the meaning of life");
        assertThat(cmd.action()).isEqualTo("unknown");
        assertThat(cmd.confidence()).isLessThan(0.5);
    }
}
