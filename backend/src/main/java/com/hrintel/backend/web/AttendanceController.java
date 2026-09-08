package com.hrintel.backend.web;

import com.hrintel.backend.dto.ShiftPlan;
import com.hrintel.backend.model.AttendanceRecord;
import com.hrintel.backend.model.Employee;
import com.hrintel.backend.security.CurrentProfile;
import com.hrintel.backend.service.MlServiceClient;
import com.hrintel.backend.service.SupabaseDataService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A 1:1 port of routes/attendance.routes.ts. */
@RestController
@RequestMapping("/api/attendance")
public class AttendanceController {

    private final SupabaseDataService data;
    private final MlServiceClient ml;

    public AttendanceController(SupabaseDataService data, MlServiceClient ml) {
        this.data = data;
        this.ml = ml;
    }

    @GetMapping
    public List<AttendanceRecord> list(@RequestParam(required = false) String since) {
        var profile = CurrentProfile.get();
        List<AttendanceRecord> all = data.getAttendance(since);

        if (profile.isHrStaff()) return all;

        return data.getEmployeeByProfileId(profile.id())
                .map(me -> all.stream().filter(a -> a.employeeId().equals(me.id())).toList())
                .orElse(List.of());
    }

    @GetMapping("/shift-plan")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ShiftPlan shiftPlan(@RequestParam(name = "department_id", required = false) String departmentId) {
        return ml.optimizeShifts(data.getAttendance(null), data.getEmployees(), departmentId);
    }

    /** Geospatial roll-up: headcount + status per region, for the workforce map. */
    @GetMapping("/geo-summary")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public List<Map<String, Object>> geoSummary() {
        List<Employee> employees = data.getEmployees();
        Map<String, Map<String, Object>> byRegion = new LinkedHashMap<>();

        for (Employee e : employees) {
            if (e.lat() == null || e.lng() == null) continue;
            Map<String, Object> existing = byRegion.computeIfAbsent(e.region(), r -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("region", r);
                m.put("lat", e.lat());
                m.put("lng", e.lng());
                m.put("headcount", 0);
                m.put("active", 0);
                return m;
            });
            existing.put("headcount", (int) existing.get("headcount") + 1);
            if ("active".equals(e.status())) existing.put("active", (int) existing.get("active") + 1);
        }

        return new ArrayList<>(byRegion.values());
    }
}
