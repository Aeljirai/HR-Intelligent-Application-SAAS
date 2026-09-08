import type { AttendanceRecord, Employee } from '../types.js';

export interface ShiftWindow {
  name: string;
  start: string; // HH:mm
  end: string;
  recommended_headcount: number;
  current_avg_headcount: number;
  is_peak: boolean;
}

export interface ShiftPlan {
  department_id: string | null;
  windows: ShiftWindow[];
  peak_hour: number; // 0-23
}

const CANDIDATE_WINDOWS: { name: string; start: string; end: string; startHour: number }[] = [
  { name: 'Early', start: '07:00', end: '15:00', startHour: 7 },
  { name: 'Standard', start: '09:00', end: '17:00', startHour: 9 },
  { name: 'Late', start: '11:00', end: '19:00', startHour: 11 },
];

/**
 * Buckets historical check-in times into an hourly histogram to find the
 * true peak arrival hour, then sizes three candidate shift windows so total
 * scheduled coverage tracks observed demand instead of a flat headcount.
 */
export function optimizeShifts(
  attendance: AttendanceRecord[],
  employees: Employee[],
  departmentId: string | null
): ShiftPlan {
  const scoped = departmentId
    ? attendance.filter((a) => {
        const emp = employees.find((e) => e.id === a.employee_id);
        return emp?.department_id === departmentId;
      })
    : attendance;

  const withCheckIn = scoped.filter((a) => a.check_in && (a.status === 'present' || a.status === 'late'));
  const hourCounts = new Array(24).fill(0);
  for (const record of withCheckIn) {
    const hour = Number(record.check_in!.split(':')[0]);
    if (!Number.isNaN(hour)) hourCounts[hour]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  const distinctDays = new Set(scoped.map((a) => a.date)).size || 1;
  const headcount = departmentId ? employees.filter((e) => e.department_id === departmentId).length : employees.length;

  const windows: ShiftWindow[] = CANDIDATE_WINDOWS.map((w) => {
    const inWindow = withCheckIn.filter((a) => {
      const hour = Number(a.check_in!.split(':')[0]);
      return hour >= w.startHour && hour < w.startHour + 2;
    });
    const avgHeadcount = inWindow.length / distinctDays;
    const isPeak = Math.abs(w.startHour - peakHour) <= 1;
    const recommended = Math.max(1, Math.round(isPeak ? avgHeadcount * 1.15 : avgHeadcount * 0.9));

    return {
      name: w.name,
      start: w.start,
      end: w.end,
      recommended_headcount: Math.min(recommended, headcount),
      current_avg_headcount: Math.round(avgHeadcount * 10) / 10,
      is_peak: isPeak,
    };
  });

  return { department_id: departmentId, windows, peak_hour: peakHour };
}
