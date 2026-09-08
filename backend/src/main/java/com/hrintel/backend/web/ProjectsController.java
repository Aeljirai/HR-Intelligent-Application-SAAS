package com.hrintel.backend.web;

import com.hrintel.backend.model.Project;
import com.hrintel.backend.service.SupabaseDataService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Read-only project list — powers the project-allocation dropdown on the daily work log form. */
@RestController
@RequestMapping("/api/projects")
public class ProjectsController {

    private final SupabaseDataService data;

    public ProjectsController(SupabaseDataService data) {
        this.data = data;
    }

    @GetMapping
    public List<Project> list() {
        return data.getProjects();
    }
}
