package com.hrintel.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TurnoverFeatureMapperTest {

    private final TurnoverFeatureMapper mapper = new TurnoverFeatureMapper();

    @Test
    void mapsKnownDepartmentNames() {
        assertThat(mapper.mapDepartment("Engineering")).isEqualTo("technical");
        assertThat(mapper.mapDepartment("Human Resources")).isEqualTo("hr");
        assertThat(mapper.mapDepartment("Customer Support")).isEqualTo("support");
    }

    @Test
    void unknownDepartmentFallsBackToManagement() {
        assertThat(mapper.mapDepartment("Nonexistent")).isEqualTo("management");
        assertThat(mapper.mapDepartment(null)).isEqualTo("management");
    }

    @Test
    void bucketsSalaryIntoThreeTiers() {
        assertThat(mapper.bucketSalary(50_000)).isEqualTo(0);
        assertThat(mapper.bucketSalary(75_000)).isEqualTo(1);
        assertThat(mapper.bucketSalary(100_000)).isEqualTo(1);
        assertThat(mapper.bucketSalary(120_000)).isEqualTo(1);
        assertThat(mapper.bucketSalary(150_000)).isEqualTo(2);
    }
}
