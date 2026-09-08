package com.hrintel.backend.dto;

import java.util.List;

public record ShiftPlan(String departmentId, List<ShiftWindow> windows, double peakHour) {
    public record ShiftWindow(String name, String start, String end, int recommendedHeadcount, double currentAvgHeadcount, boolean isPeak) {
    }
}
