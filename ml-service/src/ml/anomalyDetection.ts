import { mean, standardDeviation } from '../lib/stats.js';
import type { AttendanceRecord, Department, Employee } from '../types.js';

export interface AttendanceAnomaly {
  department_id: string;
  department_name: string;
  window_start: string;
  window_end: string;
  metric: 'absenteeism' | 'late_arrivals';
  rate: number; // 0-1
  baseline_rate: number; // department's own historical mean
  z_score: number;
  severity: 'watch' | 'warning' | 'critical';
}

const THRESHOLD_RATE = 0.15; // flat 15% threshold requested by product
const WINDOW_DAYS = 7;

/**
 * Client/server-shared "ML" simulation: a rolling-window rate compared
 * against (a) a flat 15% threshold and (b) the department's own historical
 * z-score, so a department that is *normally* a bit noisy doesn't trigger
 * false alarms while a real spike still does.
 */
export function detectAttendanceAnomalies(
  attendance: AttendanceRecord[],
  employees: Employee[],
  departments: Department[]
): AttendanceAnomaly[] {
  const deptByEmployee = new Map(employees.map((e) => [e.id, e.department_id]));
  const anomalies: AttendanceAnomaly[] = [];

  for (const dept of departments) {
    const deptEmployeeIds = new Set(
      employees.filter((e) => e.department_id === dept.id).map((e) => e.id)
    );
    if (deptEmployeeIds.size === 0) continue;

    const deptAttendance = attendance.filter((a) => deptByEmployee.get(a.employee_id) === dept.id);
    const byDate = groupByDate(deptAttendance);
    const dates = Object.keys(byDate).sort();
    if (dates.length < WINDOW_DAYS) continue;

    for (const metric of ['absenteeism', 'late_arrivals'] as const) {
      const dailyRates = dates.map((date) => rateForDate(byDate[date] ?? [], metric));
      const rollingRates: number[] = [];
      for (let i = WINDOW_DAYS - 1; i < dailyRates.length; i++) {
        const windowSlice = dailyRates.slice(i - WINDOW_DAYS + 1, i + 1);
        rollingRates.push(mean(windowSlice));
      }
      if (rollingRates.length === 0) continue;

      const baseline = mean(rollingRates);
      const sd = rollingRates.length > 1 ? standardDeviation(rollingRates) : 0;
      const latestRate = rollingRates[rollingRates.length - 1] ?? 0;
      const zScore = sd > 0 ? (latestRate - baseline) / sd : 0;

      if (latestRate >= THRESHOLD_RATE && (zScore >= 1.5 || latestRate >= THRESHOLD_RATE * 1.5)) {
        const severity: AttendanceAnomaly['severity'] =
          latestRate >= THRESHOLD_RATE * 2 || zScore >= 3
            ? 'critical'
            : latestRate >= THRESHOLD_RATE * 1.5 || zScore >= 2
              ? 'warning'
              : 'watch';

        anomalies.push({
          department_id: dept.id,
          department_name: dept.name,
          window_start: dates[dates.length - WINDOW_DAYS] ?? dates[0]!,
          window_end: dates[dates.length - 1]!,
          metric,
          rate: round(latestRate),
          baseline_rate: round(baseline),
          z_score: round(zScore),
          severity,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.rate - a.rate);
}

function groupByDate(records: AttendanceRecord[]) {
  const map: Record<string, AttendanceRecord[]> = {};
  for (const r of records) {
    (map[r.date] ??= []).push(r);
  }
  return map;
}

function rateForDate(records: AttendanceRecord[], metric: 'absenteeism' | 'late_arrivals') {
  if (records.length === 0) return 0;
  const hits = records.filter((r) =>
    metric === 'absenteeism' ? r.status === 'absent' : r.status === 'late'
  ).length;
  return hits / records.length;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
