package com.hrintel.backend.model;

public record AttendanceRecord(
        String id,
        String employeeId,
        String date,
        String status,
        String checkIn,
        String checkOut,
        double hoursWorked
) {
}
