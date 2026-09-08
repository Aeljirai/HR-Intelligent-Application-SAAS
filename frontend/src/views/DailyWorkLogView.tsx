import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner, ErrorState } from '@/components/ui/Feedback';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useAllDailyWorkLogs, useDepartments, useMyDailyWorkLogs, useProjects, useSubmitDailyWorkLog } from '@/hooks/queries';
import { cn, formatDate } from '@/lib/utils';
import type { CreateDailyWorkLogPayload, DailyWorkLog, LeaveReason, ProjectAllocation } from '@/types';

const TOLERANCE = 0.6;
const LEAVE_REASONS: LeaveReason[] = ['sick', 'vacation', 'unpaid', 'other'];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatBreakdown(log: Pick<DailyWorkLog, 'worked' | 'allocations'>): string {
  if (!log.worked || !log.allocations.length) return '—';
  return log.allocations.map((a) => `${a.project_name} (${Math.round(a.percent)}%)`).join(', ');
}

export function DailyWorkLogView() {
  const { profile } = useAuthStore();
  const t = useT();
  const isHrStaff = profile?.role === 'admin' || profile?.role === 'manager';

  return (
    <PageContainer>
      <PageHeader
        title={t('dailyLog.title')}
        subtitle={isHrStaff ? t('dailyLog.hrSubtitle') : t('dailyLog.employeeSubtitle')}
      />
      {isHrStaff ? <HrDailyLogView /> : <MyDailyLogView />}
    </PageContainer>
  );
}

interface AllocationRow {
  key: string;
  projectId: string;
  value: number;
}

function MyDailyLogView() {
  const t = useT();
  const projectsQuery = useProjects();
  const myLogs = useMyDailyWorkLogs();
  const submit = useSubmitDailyWorkLog();

  const projectOptions = useMemo(() => {
    const real = (projectsQuery.data ?? [])
      .filter((p) => p.status !== 'completed')
      .map((p) => ({ id: p.id, name: p.name }));
    return [...real, { id: 'internal-admin', name: t('dailyLog.overheadInternalAdmin') }, { id: 'client-support', name: t('dailyLog.overheadClientSupport') }];
  }, [projectsQuery.data, t]);

  const [worked, setWorked] = useState(true);
  const [leaveReason, setLeaveReason] = useState<LeaveReason | ''>('');
  const [standardHours, setStandardHours] = useState('8');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [splitMode, setSplitMode] = useState<'percent' | 'hours'>('percent');
  const [rows, setRows] = useState<AllocationRow[]>([{ key: 'row-0', projectId: '', value: 100 }]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const totalHours = round1((Number(standardHours) || 0) + (Number(overtimeHours) || 0));
  const target = splitMode === 'percent' ? 100 : totalHours;
  const rowSum = round1(rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0));
  const rowsComplete = rows.length > 0 && rows.every((r) => r.projectId);
  const sumValid = target > 0 && Math.abs(rowSum - target) <= TOLERANCE;
  const canSubmit = worked
    ? Number(standardHours) > 0 && rowsComplete && sumValid
    : leaveReason !== '';

  function handleModeChange(mode: 'percent' | 'hours') {
    if (mode === splitMode) return;
    setRows((prev) =>
      prev.map((r) => {
        const value = Number(r.value) || 0;
        if (mode === 'hours') return { ...r, value: totalHours > 0 ? round1((value / 100) * totalHours) : 0 };
        return { ...r, value: totalHours > 0 ? round1((value / totalHours) * 100) : 0 };
      })
    );
    setSplitMode(mode);
  }

  function addRow() {
    setRows((prev) => [...prev, { key: `row-${Date.now()}`, projectId: '', value: 0 }]);
  }
  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }
  function updateRow(key: string, patch: Partial<AllocationRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setSuccessMessage(null);
    const allocations: ProjectAllocation[] = worked
      ? rows.map((r) => {
          const project = projectOptions.find((p) => p.id === r.projectId);
          const value = Number(r.value) || 0;
          const percent = splitMode === 'percent' ? value : totalHours > 0 ? (value / totalHours) * 100 : 0;
          const hours = splitMode === 'hours' ? value : (value / 100) * totalHours;
          return { project_id: r.projectId, project_name: project?.name ?? '', percent: round1(percent), hours: round1(hours) };
        })
      : [];

    const payload: CreateDailyWorkLogPayload = {
      log_date: todayIso(),
      worked,
      leave_reason: worked ? null : (leaveReason as LeaveReason),
      standard_hours: worked ? Number(standardHours) || 0 : 0,
      overtime_hours: worked ? Number(overtimeHours) || 0 : 0,
      allocations,
    };

    await submit.mutateAsync(payload);
    setSuccessMessage(t('dailyLog.submitSuccess', { date: formatDate(payload.log_date) }));
  }

  const columns: DataTableColumn<DailyWorkLog>[] = [
    { key: 'date', header: t('attendance.dateColumn'), render: (l) => formatDate(l.log_date), csvValue: (l) => formatDate(l.log_date) },
    {
      key: 'worked',
      header: t('dailyLog.workedColumn'),
      render: (l) => (l.worked ? <Badge tone="green">{t('dailyLog.yes')}</Badge> : <Badge tone="slate">{t(`dailyLog.reason${capitalize(l.leave_reason ?? 'other')}`)}</Badge>),
      csvValue: (l) => (l.worked ? t('dailyLog.yes') : t(`dailyLog.reason${capitalize(l.leave_reason ?? 'other')}`)),
    },
    { key: 'standard', header: t('attendance.hoursColumn'), align: 'right', render: (l) => `${l.standard_hours.toFixed(1)}h`, csvValue: (l) => l.standard_hours.toFixed(1) },
    { key: 'overtime', header: t('dailyLog.overtimeColumn'), align: 'right', render: (l) => `${l.overtime_hours.toFixed(1)}h`, csvValue: (l) => l.overtime_hours.toFixed(1) },
    {
      key: 'total',
      header: t('dailyLog.totalHoursColumn'),
      align: 'right',
      render: (l) => `${(l.standard_hours + l.overtime_hours).toFixed(1)}h`,
      csvValue: (l) => (l.standard_hours + l.overtime_hours).toFixed(1),
    },
    { key: 'breakdown', header: t('dailyLog.breakdownColumn'), render: (l) => formatBreakdown(l), csvValue: (l) => formatBreakdown(l) },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{formatDate(todayIso())}</CardTitle></CardHeader>
        <CardBody className="space-y-5">
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">{t('dailyLog.didYouWork')}</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
              <button
                onClick={() => setWorked(true)}
                className={cn('px-4 py-1.5 text-sm font-medium transition-colors', worked ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
              >
                {t('dailyLog.yes')}
              </button>
              <button
                onClick={() => setWorked(false)}
                className={cn('px-4 py-1.5 text-sm font-medium transition-colors', !worked ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
              >
                {t('dailyLog.no')}
              </button>
            </div>
          </div>

          {!worked ? (
            <label className="block max-w-xs">
              <span className="mb-1 block text-sm text-slate-600">{t('dailyLog.leaveReasonLabel')}</span>
              <select
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value as LeaveReason)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('dailyLog.leaveReasonPlaceholder')}</option>
                {LEAVE_REASONS.map((r) => (
                  <option key={r} value={r}>{t(`dailyLog.reason${capitalize(r)}`)}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <div className="grid max-w-md grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">{t('dailyLog.standardHours')}</span>
                  <input
                    type="number" min={0} max={24} step={0.5}
                    value={standardHours}
                    onChange={(e) => setStandardHours(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">{t('dailyLog.overtimeHours')}</span>
                  <input
                    type="number" min={0} max={24} step={0.5}
                    value={overtimeHours}
                    onChange={(e) => setOvertimeHours(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{t('dailyLog.projectAllocationTitle')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{t('dailyLog.splitByLabel')}</span>
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs">
                      <button
                        onClick={() => handleModeChange('percent')}
                        className={cn('px-2.5 py-1 font-medium transition-colors', splitMode === 'percent' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
                      >
                        {t('dailyLog.splitByPercent')}
                      </button>
                      <button
                        onClick={() => handleModeChange('hours')}
                        className={cn('px-2.5 py-1 font-medium transition-colors', splitMode === 'hours' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
                      >
                        {t('dailyLog.splitByHours')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {rows.map((row) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <select
                        value={row.projectId}
                        onChange={(e) => updateRow(row.key, { projectId: e.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">{t('dailyLog.selectProject')}</option>
                        {projectOptions.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <div className="relative w-28 shrink-0">
                        <input
                          type="number" min={0} step={splitMode === 'percent' ? 1 : 0.5}
                          value={row.value}
                          onChange={(e) => updateRow(row.key, { value: Number(e.target.value) })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-7 text-sm"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                          {splitMode === 'percent' ? '%' : 'h'}
                        </span>
                      </div>
                      <button
                        onClick={() => removeRow(row.key)}
                        disabled={rows.length === 1}
                        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={t('dailyLog.removeProject')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                <button onClick={addRow} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
                  <Plus size={15} /> {t('dailyLog.addProject')}
                </button>

                <div className={cn('mt-3 flex items-center gap-1.5 text-xs font-medium', sumValid ? 'text-emerald-600' : 'text-amber-600')}>
                  {sumValid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {splitMode === 'percent'
                    ? sumValid
                      ? t('dailyLog.totalPercentLabel', { pct: rowSum })
                      : t('dailyLog.invalidTotalPercent', { pct: rowSum })
                    : sumValid
                      ? t('dailyLog.totalHoursLabel', { hours: rowSum, target })
                      : t('dailyLog.invalidTotalHours', { hours: rowSum, target })}
                </div>
              </div>
            </>
          )}

          {submit.isError && <ErrorState message={t('dailyLog.submitError')} />}
          {successMessage && (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 size={15} /> {successMessage}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!canSubmit || submit.isPending} className="w-full sm:w-auto">
            {submit.isPending ? t('dailyLog.submitting') : t('dailyLog.submit')}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('dailyLog.recentTitle')}</CardTitle></CardHeader>
        <CardBody>
          {myLogs.isLoading ? (
            <Spinner />
          ) : myLogs.isError ? (
            <ErrorState message={t('dailyLog.couldNotLoadMine')} />
          ) : (
            <DataTable
              columns={columns}
              rows={[...(myLogs.data ?? [])].sort((a, b) => (a.log_date < b.log_date ? 1 : -1))}
              getRowKey={(l) => l.id}
              exportFilename="my-daily-work-log.csv"
              exportLabel={t('attendance.exportCsv')}
              emptyTitle={t('dailyLog.noSubmissions')}
              emptyDescription={t('dailyLog.noSubmissionsDesc')}
              maxHeightClassName="max-h-[420px]"
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function HrDailyLogView() {
  const t = useT();
  const departmentsQuery = useDepartments();
  const logsQuery = useAllDailyWorkLogs();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const departmentById = useMemo(() => new Map((departmentsQuery.data ?? []).map((d) => [d.id, d.name])), [departmentsQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(logsQuery.data ?? [])]
      .filter((l) => {
        if (departmentId && l.employee?.department_id !== departmentId) return false;
        if (q && !l.employee?.full_name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
  }, [logsQuery.data, departmentId, search]);

  const columns: DataTableColumn<DailyWorkLog>[] = [
    { key: 'date', header: t('attendance.dateColumn'), render: (l) => formatDate(l.log_date), csvValue: (l) => formatDate(l.log_date) },
    { key: 'employee', header: t('attendance.employeeColumn'), render: (l) => l.employee?.full_name ?? '—', csvValue: (l) => l.employee?.full_name ?? '—' },
    {
      key: 'department',
      header: t('attendance.departmentColumn'),
      render: (l) => departmentById.get(l.employee?.department_id ?? '') ?? '—',
      csvValue: (l) => departmentById.get(l.employee?.department_id ?? '') ?? '—',
    },
    {
      key: 'worked',
      header: t('dailyLog.workedColumn'),
      render: (l) => (l.worked ? <Badge tone="green">{t('dailyLog.yes')}</Badge> : <Badge tone="slate">{t(`dailyLog.reason${capitalize(l.leave_reason ?? 'other')}`)}</Badge>),
      csvValue: (l) => (l.worked ? t('dailyLog.yes') : t(`dailyLog.reason${capitalize(l.leave_reason ?? 'other')}`)),
    },
    { key: 'standard', header: t('attendance.hoursColumn'), align: 'right', render: (l) => `${l.standard_hours.toFixed(1)}h`, csvValue: (l) => l.standard_hours.toFixed(1) },
    { key: 'overtime', header: t('dailyLog.overtimeColumn'), align: 'right', render: (l) => `${l.overtime_hours.toFixed(1)}h`, csvValue: (l) => l.overtime_hours.toFixed(1) },
    {
      key: 'total',
      header: t('dailyLog.totalHoursColumn'),
      align: 'right',
      render: (l) => `${(l.standard_hours + l.overtime_hours).toFixed(1)}h`,
      csvValue: (l) => (l.standard_hours + l.overtime_hours).toFixed(1),
    },
    { key: 'breakdown', header: t('dailyLog.breakdownColumn'), render: (l) => formatBreakdown(l), csvValue: (l) => formatBreakdown(l) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dailyLog.allSubmissionsTitle')}</CardTitle>
        <span className="text-xs text-slate-400">{t('attendance.recordCount', { count: filtered.length })}</span>
      </CardHeader>
      <CardBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={departmentId ?? 'all'}
            onChange={(e) => setDepartmentId(e.target.value === 'all' ? null : e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
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

        {logsQuery.isLoading ? (
          <Spinner />
        ) : logsQuery.isError ? (
          <ErrorState message={t('dailyLog.couldNotLoadAll')} />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            getRowKey={(l) => l.id}
            exportFilename="daily-work-logs.csv"
            exportLabel={t('attendance.exportCsv')}
            emptyTitle={t('attendance.noMatchingRecords')}
            emptyDescription={t('attendance.noMatchingRecordsDesc')}
            maxHeightClassName="max-h-[520px]"
          />
        )}
      </CardBody>
    </Card>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
