package com.hrintel.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class HrIntelBackendApplication {
    public static void main(String[] args) {
        SpringApplication.run(HrIntelBackendApplication.class, args);
    }
}
