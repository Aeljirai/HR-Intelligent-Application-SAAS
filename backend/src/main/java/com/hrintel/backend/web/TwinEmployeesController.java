package com.hrintel.backend.web;

import com.hrintel.backend.model.Employee;
import com.hrintel.backend.model.EmployeeSkill;
import com.hrintel.backend.model.Project;
import com.hrintel.backend.model.ProjectMember;
import com.hrintel.backend.service.SupabaseDataService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.*;

/**
 * "Twin employees" = two or more people who carry the same skill but sit on
 * different projects — i.e. hidden redundancy/cross-staffing candidates a
 * manager wouldn't otherwise see. A 1:1 port of routes/twinEmployees.routes.ts.
 */
@RestController
@RequestMapping("/api/twin-employees")
@PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
public class TwinEmployeesController {

    private final SupabaseDataService data;

    public TwinEmployeesController(SupabaseDataService data) {
        this.data = data;
    }

    private record Member(String employeeId, int proficiency) {
    }

    @GetMapping
    public Map<String, Object> list(
            @RequestParam(required = false) Integer minMembers,
            @RequestParam(required = false) String skill
    ) {
        int minMembersEffective = Math.max(2, minMembers != null ? minMembers : 2);
        String skillFilter = skill != null ? skill.toLowerCase() : null;

        List<Employee> employees = data.getEmployees();
        List<EmployeeSkill> skills = data.getEmployeeSkills();
        List<Project> projects = data.getProjects();
        List<ProjectMember> memberships = data.getProjectMembers();

        Map<String, Employee> activeEmployees = new LinkedHashMap<>();
        for (Employee e : employees) if ("active".equals(e.status())) activeEmployees.put(e.id(), e);
        Map<String, Project> projectById = new HashMap<>();
        for (Project p : projects) projectById.put(p.id(), p);

        Map<String, Set<String>> projectsByEmployee = new HashMap<>();
        for (ProjectMember m : memberships) {
            if (!activeEmployees.containsKey(m.employeeId())) continue;
            projectsByEmployee.computeIfAbsent(m.employeeId(), k -> new LinkedHashSet<>()).add(m.projectId());
        }

        Map<String, List<Member>> bySkill = new LinkedHashMap<>();
        for (EmployeeSkill s : skills) {
            if (!activeEmployees.containsKey(s.employeeId())) continue;
            bySkill.computeIfAbsent(s.skillName(), k -> new ArrayList<>()).add(new Member(s.employeeId(), s.proficiency()));
        }

        List<Map<String, Object>> groups = new ArrayList<>();

        for (var entry : bySkill.entrySet()) {
            String skillName = entry.getKey();
            List<Member> members = entry.getValue();
            if (skillFilter != null && !skillName.toLowerCase().contains(skillFilter)) continue;
            if (members.size() < minMembersEffective) continue;

            List<Set<String>> memberProjectSets = members.stream()
                    .map(m -> projectsByEmployee.getOrDefault(m.employeeId(), Set.of()))
                    .toList();
            Set<String> unionProjects = new LinkedHashSet<>();
            memberProjectSets.forEach(unionProjects::addAll);

            // Everyone on the same single project (or nobody on any project) isn't a "twin" finding.
            if (unionProjects.size() < 2) continue;

            int crossProjectPairs = 0;
            for (int i = 0; i < members.size(); i++) {
                for (int j = i + 1; j < members.size(); j++) {
                    Set<String> a = memberProjectSets.get(i);
                    Set<String> b = memberProjectSets.get(j);
                    boolean overlaps = a.stream().anyMatch(b::contains);
                    if (!overlaps) crossProjectPairs++;
                }
            }
            if (crossProjectPairs == 0) continue;

            int finalCrossProjectPairs = crossProjectPairs;
            List<Map<String, Object>> memberJson = members.stream()
                    .sorted((a, b) -> Integer.compare(b.proficiency(), a.proficiency()))
                    .map(m -> {
                        Employee employee = activeEmployees.get(m.employeeId());
                        List<Map<String, Object>> employeeProjects = projectsByEmployee.getOrDefault(m.employeeId(), Set.of()).stream()
                                .map(projectById::get)
                                .filter(Objects::nonNull)
                                .map(p -> Map.<String, Object>of("id", p.id(), "name", p.name(), "status", p.status()))
                                .toList();
                        Map<String, Object> json = new LinkedHashMap<>();
                        json.put("employee_id", employee.id());
                        json.put("full_name", employee.fullName());
                        json.put("job_title", employee.jobTitle());
                        json.put("department_id", employee.departmentId());
                        json.put("seniority", employee.seniority());
                        json.put("proficiency", m.proficiency());
                        json.put("projects", employeeProjects);
                        return json;
                    })
                    .toList();

            Map<String, Object> group = new LinkedHashMap<>();
            group.put("skill", skillName);
            group.put("members", memberJson);
            group.put("distinct_project_count", unionProjects.size());
            group.put("cross_project_pairs", finalCrossProjectPairs);
            groups.add(group);
        }

        groups.sort((a, b) -> {
            int byPairs = Integer.compare((int) b.get("cross_project_pairs"), (int) a.get("cross_project_pairs"));
            if (byPairs != 0) return byPairs;
            return Integer.compare(((List<?>) b.get("members")).size(), ((List<?>) a.get("members")).size());
        });

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("groups", groups.stream().limit(40).toList());
        response.put("total_groups_found", groups.size());
        response.put("generated_at", Instant.now().toString());
        return response;
    }
}
