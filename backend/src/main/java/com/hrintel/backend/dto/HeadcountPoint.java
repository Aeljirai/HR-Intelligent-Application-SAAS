package com.hrintel.backend.dto;

public record HeadcountPoint(String month, Double actual, Double forecast, Double lower, Double upper) {
}
