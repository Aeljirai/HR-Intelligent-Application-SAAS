package com.hrintel.backend.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EmployeeJsonMappingTest {

    @Test
    void deserializesSnakeCaseJsonFromPostgrest() throws Exception {
        ObjectMapper mapper = new ObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        String json = """
                {
                  "id": "e1", "profile_id": null, "full_name": "Test Person", "email": "t@x.com",
                  "department_id": "d1", "job_title": "Engineer", "seniority": "mid",
                  "hire_date": "2023-05-01", "termination_date": null,
                  "salary": 90000, "market_salary": 95000, "performance_score": 80,
                  "pto_balance": 10, "pto_used_ytd": 2, "manager_id": null,
                  "status": "active", "contract_type": "full_time", "region": "Remote",
                  "lat": null, "lng": null, "overtime_hours_month": 5, "days_since_vacation": 30,
                  "satisfaction_level": 0.7, "work_accident": false, "promotion_last_5years": true
                }
                """;
        Employee e = mapper.readValue(json, Employee.class);
        assertThat(e.hireDate()).isEqualTo("2023-05-01");
        assertThat(e.fullName()).isEqualTo("Test Person");
        assertThat(e.promotionLast5years()).isTrue();
    }
}
