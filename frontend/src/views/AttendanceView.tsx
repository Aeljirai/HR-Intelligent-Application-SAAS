import { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { GeoMap } from '@/components/charts/GeoMap';
import { useAttendance, useDepartments, useEmployees, useGeoSummary, useShiftPlan } from '@/hooks/queries';
import { formatDate } from '@/lib/utils';
import type { AttendanceRecord, AttendanceStatus } from '@/types';

const STATUS_TONE: Record<AttendanceStatus, 'green' | 'blue' | 'amber' | 'red' | 'slate'> = {
  present: 'green',
  remote: 'blue',
  late: 'amber',
  absent: 'red',
  pto: 'slate',
};

/** Seed data stores "HH:MM:SS" — trim to "HH:MM" for a table, and show an em dash when the employee was absent. */
function formatTime(hms: string | null): string {
  return hms ? hms.slice(0, 5) : '—';
}

function dateRangeToSince(range: '7' | '30' | '90' | 'all'): string | undefined {
  if (range === 'all') return undefined;
  const days = { '7': 7, '30': 30, '90': 90 }[range];
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function AttendanceView() {
  const { profile } = useAuthStore();
  const t = useT();
  const isHrStaff = profile?.role === 'admin' || profile?.role === 'manager';

  return (
    <PageContainer>
      <PageHeader
        title={t('attendance.title')}
        subtitle={isHrStaff ? t('attendance.hrSubtitle') : t('attendance.employeeSubtitle')}
      />
      {isHrStaff ? <HrAttendanceView /> : <MyAttendanceView />}
    </PageContainer>
  );
}

function HrAttendanceView() {
  const t = useT();
  const departmentsQuery = useDepartments();
  const employeesQuery = useEmployees();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const shiftPlan = useShiftPlan(departmentId);
  const geo = useGeoSummary();

  const [dateRange, setDateRange] = useState<'7' | '30' | '90' | 'all'>('30');
  const [recordsDeptId, setRecordsDeptId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const attendance = useAttendance(dateRangeToSince(dateRange));

  const employeeById = useMemo(() => new Map((employeesQuery.data ?? []).map((e) => [e.id, e])), [employeesQuery.data]);
  const departmentById = useMemo(() => new Map((departmentsQuery.data ?? []).map((d) => [d.id, d.name])), [departmentsQuery.data]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(attendance.data ?? [])]
      .filter((r) => {
        const emp = employeeById.get(r.employee_id);
        if (recordsDeptId && emp?.department_id !== recordsDeptId) return false;
        if (q && !emp?.full_name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [attendance.data, employeeById, recordsDeptId, search]);

  const columns: DataTableColumn<AttendanceRecord>[] = [
    { key: 'date', header: t('attendance.dateColumn'), render: (r) => formatDate(r.date), csvValue: (r) => formatDate(r.date) },
    {
      key: 'employee',
      header: t('attendance.employeeColumn'),
      render: (r) => employeeById.get(r.employee_id)?.full_name ?? '—',
      csvValue: (r) => employeeById.get(r.employee_id)?.full_name ?? '—',
    },
    {
      key: 'department',
      header: t('attendance.departmentColumn'),
      render: (r) => departmentById.get(employeeById.get(r.employee_id)?.department_id ?? '') ?? '—',
      csvValue: (r) => departmentById.get(employeeById.get(r.employee_id)?.department_id ?? '') ?? '—',
    },
    {
      key: 'status',
      header: t('attendance.statusColumn'),
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Badge>,
      csvValue: (r) => t(`status.${r.status}`),
    },
    { key: 'check_in', header: t('attendance.checkInColumn'), render: (r) => formatTime(r.check_in), csvValue: (r) => formatTime(r.check_in) },
    { key: 'check_out', header: t('attendance.checkOutColumn'), render: (r) => formatTime(r.check_out), csvValue: (r) => formatTime(r.check_out) },
    {
      key: 'hours',
      header: t('attendance.hoursColumn'),
      align: 'right',
      render: (r) => `${r.hours_worked.toFixed(1)}h`,
      csvValue: (r) => r.hours_worked.toFixed(1),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('attendance.shiftTitle')}</CardTitle>
            <select
              value={departmentId ?? 'all'}
              onChange={(e) => setDepartmentId(e.target.value === 'all' ? null : e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value="all">{t('common.allDepartments')}</option>
              {(departmentsQuery.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </CardHeader>
          <CardBody>
            {shiftPlan.isLoading ? (
              <Spinner />
            ) : shiftPlan.isError ? (
              <ErrorState message={t('attendance.couldNotLoadShiftPlan')} />
            ) : shiftPlan.data ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  {t('attendance.peakHour', { hour: shiftPlan.data.peak_hour })}
                </p>
                {shiftPlan.data.windows.map((w) => (
                  <div key={w.name} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        {t('attendance.shift', { name: w.name })} {w.is_peak && <Badge tone="amber">{t('attendance.peak')}</Badge>}
                      </div>
                      <div className="text-xs text-slate-400">{w.start} – {w.end}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-slate-800">{t('attendance.recommended', { count: w.recommended_headcount })}</div>
                      <div className="text-xs text-slate-400">{t('attendance.currentlyAvg', { count: w.current_avg_headcount })}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('attendance.geoTitle')}</CardTitle></CardHeader>
          <CardBody>
            {geo.isLoading ? (
              <Spinner />
            ) : geo.isError ? (
              <ErrorState message={t('attendance.couldNotLoadGeo')} />
            ) : geo.data?.length ? (
              <GeoMap points={geo.data} width={520} height={340} />
            ) : (
              <EmptyState title={t('attendance.noLocationData')} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('attendance.allRecordsTitle')}</CardTitle>
          <span className="text-xs text-slate-400">{t('attendance.recordCount', { count: filteredRecords.length })}</span>
        </CardHeader>
        <CardBody>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
              aria-label={t('attendance.dateRangeLabel')}
            >
              <option value="7">{t('attendance.last7Days')}</option>
              <option value="30">{t('attendance.last30DaysOption')}</option>
              <option value="90">{t('attendance.last90Days')}</option>
              <option value="all">{t('attendance.allTime')}</option>
            </select>
            <select
              value={recordsDeptId ?? 'all'}
              onChange={(e) => setRecordsDeptId(e.target.value === 'all' ? null : e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
              aria-label={t('attendance.departmentColumn')}
            >
              <option value="all">{t('common.allDepartments')}</option>
              {(departmentsQuery.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('attendance.searchEmployeePlaceholder')}
              className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
          </div>

          {attendance.isLoading || employeesQuery.isLoading ? (
            <Spinner />
          ) : attendance.isError ? (
            <ErrorState message={t('attendance.couldNotLoadMine')} />
          ) : (
            <DataTable
              columns={columns}
              rows={filteredRecords}
              getRowKey={(r) => r.id}
              exportFilename={`attendance-records-${dateRange === 'all' ? 'all-time' : `last-${dateRange}-days`}.csv`}
              exportLabel={t('attendance.exportCsv')}
              emptyTitle={t('attendance.noMatchingRecords')}
              emptyDescription={t('attendance.noMatchingRecordsDesc')}
              maxHeightClassName="max-h-[480px]"
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function MyAttendanceView() {
  const t = useT();
  const attendance = useAttendance();
  const records = [...(attendance.data ?? [])].reverse().slice(0, 30);

  const columns: DataTableColumn<AttendanceRecord>[] = [
    { key: 'date', header: t('attendance.dateColumn'), render: (r) => formatDate(r.date), csvValue: (r) => formatDate(r.date) },
    {
      key: 'status',
      header: t('attendance.statusColumn'),
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Badge>,
      csvValue: (r) => t(`status.${r.status}`),
    },
    { key: 'check_in', header: t('attendance.checkInColumn'), render: (r) => formatTime(r.check_in), csvValue: (r) => formatTime(r.check_in) },
    { key: 'check_out', header: t('attendance.checkOutColumn'), render: (r) => formatTime(r.check_out), csvValue: (r) => formatTime(r.check_out) },
    {
      key: 'hours',
      header: t('attendance.hoursColumn'),
      align: 'right',
      render: (r) => `${r.hours_worked.toFixed(1)}h`,
      csvValue: (r) => r.hours_worked.toFixed(1),
    },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>{t('attendance.last30Days')}</CardTitle></CardHeader>
      <CardBody>
        {attendance.isLoading ? (
          <Spinner />
        ) : attendance.isError ? (
          <ErrorState message={t('attendance.couldNotLoadMine')} />
        ) : (
          <DataTable
            columns={columns}
            rows={records}
            getRowKey={(r) => r.id}
            exportFilename="my-attendance-history.csv"
            exportLabel={t('attendance.exportCsv')}
            emptyTitle={t('attendance.noRecords')}
            maxHeightClassName="max-h-[480px]"
          />
        )}
      </CardBody>
    </Card>
  );
}
