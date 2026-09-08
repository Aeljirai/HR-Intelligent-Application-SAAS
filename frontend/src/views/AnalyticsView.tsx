import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Slider } from '@/components/ui/Slider';
import { Spinner, ErrorState } from '@/components/ui/Feedback';
import { OnaNetworkGraph } from '@/components/charts/OnaNetworkGraph';
import { CATEGORICAL, SENTIMENT_PULSE } from '@/lib/chartColors';
import { useCompensationSandbox, useDepartments, useEmployees, useOnaGraph } from '@/hooks/queries';
import { cn, formatCompactCurrency } from '@/lib/utils';

export function AnalyticsView() {
  const t = useT();
  return (
    <PageContainer>
      <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitle')} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <OnaSection />
        <CompensationSandboxSection />
      </div>
    </PageContainer>
  );
}

function OnaSection() {
  const t = useT();
  const graphQuery = useOnaGraph();
  const departmentsQuery = useDepartments();
  const departments = departmentsQuery.data ?? [];
  const [colorBy, setColorBy] = useState<'department' | 'pulse'>('department');

  const pulseById = useMemo(
    () => new Map((graphQuery.data?.pulse ?? []).map((p) => [p.employee_id, p.pulse])),
    [graphQuery.data]
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('analytics.networkTitle')}</CardTitle>
          <span className="text-xs text-slate-400">
            {colorBy === 'pulse' ? t('analytics.pulseSubtitle') : t('analytics.networkSubtitle')}
          </span>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-xs font-medium">
          {(['department', 'pulse'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setColorBy(mode)}
              className={cn('px-2.5 py-1 transition-colors', colorBy === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}
            >
              {mode === 'department' ? t('analytics.colorByDepartment') : t('analytics.colorByPulse')}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardBody>
        {graphQuery.isLoading ? (
          <Spinner />
        ) : graphQuery.isError ? (
          <ErrorState message={t('analytics.couldNotLoadGraph')} />
        ) : graphQuery.data ? (
          <>
            <OnaNetworkGraph graph={graphQuery.data} departments={departments} colorBy={colorBy} pulseById={pulseById} width={520} height={420} />
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-amber-400" /> {t('analytics.legendBridge')}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-slate-400" /> {t('analytics.legendIsolated')}</span>
              {colorBy === 'pulse' ? (
                <>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SENTIMENT_PULSE.positive }} /> {t('analytics.legendPulsePositive')}</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SENTIMENT_PULSE.neutral }} /> {t('analytics.legendPulseNeutral')}</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SENTIMENT_PULSE.negative }} /> {t('analytics.legendPulseNegative')}</span>
                </>
              ) : (
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORICAL[0] }} /> {t('analytics.legendDept')}</span>
              )}
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function CompensationSandboxSection() {
  const t = useT();
  const [adjustment, setAdjustment] = useState(0);
  const employeesQuery = useEmployees();
  const departmentsQuery = useDepartments();
  const sandbox = useCompensationSandbox();

  useEffect(() => {
    sandbox.mutate(adjustment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustment]);

  const employees = employeesQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const maxPayroll = Math.max(...(sandbox.data?.by_department.map((d) => d.adjusted_payroll) ?? [1]), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.sandboxTitle')}</CardTitle>
        <span className="text-xs text-slate-400">{t('analytics.sandboxSubtitle', { employees: employees.length, departments: departments.length })}</span>
      </CardHeader>
      <CardBody className="space-y-5">
        <Slider label={t('analytics.adjustmentSlider')} value={adjustment} min={-10} max={15} unit="%" onChange={setAdjustment} />

        {sandbox.data && (
          <>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <div>
                <div className="text-xs text-slate-500">{t('analytics.totalImpact')}</div>
                <div className="text-lg font-semibold text-slate-800">{formatCompactCurrency(sandbox.data.total_adjusted)}</div>
              </div>
              <Badge tone={sandbox.data.total_delta >= 0 ? 'red' : 'green'}>
                {sandbox.data.total_delta >= 0 ? '+' : ''}
                {formatCompactCurrency(sandbox.data.total_delta)}
              </Badge>
            </div>

            <div className="space-y-2">
              {sandbox.data.by_department.map((d, i) => (
                <div key={d.department_id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600">{d.department_name}</span>
                    <span className="font-medium text-slate-700">{formatCompactCurrency(d.adjusted_payroll)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${(d.adjusted_payroll / maxPayroll) * 100}%`, background: CATEGORICAL[i % CATEGORICAL.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
