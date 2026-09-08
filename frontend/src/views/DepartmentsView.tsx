import { ArrowRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { HeatmapGrid } from '@/components/charts/HeatmapGrid';
import { useBudgetHeatmap, useReallocation } from '@/hooks/queries';
import { formatCompactCurrency } from '@/lib/utils';

const URGENCY_TONE: Record<string, BadgeTone> = { low: 'slate', medium: 'amber', high: 'red' };

export function DepartmentsView() {
  const t = useT();
  const heatmap = useBudgetHeatmap();
  const reallocation = useReallocation();

  return (
    <PageContainer>
      <PageHeader title={t('departments.title')} subtitle={t('departments.subtitle')} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('departments.budgetTitle')}</CardTitle></CardHeader>
          <CardBody>
            {heatmap.isLoading ? (
              <Spinner />
            ) : heatmap.isError ? (
              <ErrorState message={t('departments.couldNotLoadHeatmap')} />
            ) : heatmap.data ? (
              <div className="space-y-6">
                <HeatmapGrid
                  title={t('departments.budgetUtilization')}
                  cells={heatmap.data.map((d) => ({ row: d.department_name, value: Math.min(100, d.utilization_pct), sublabel: formatCompactCurrency(d.payroll) }))}
                />
                <HeatmapGrid
                  title={t('departments.efficiencyScore')}
                  cells={heatmap.data.map((d) => ({ row: d.department_name, value: d.efficiency_score }))}
                />
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('departments.reallocationTitle')}</CardTitle></CardHeader>
          <CardBody>
            {reallocation.isLoading ? (
              <Spinner />
            ) : reallocation.isError ? (
              <ErrorState message={t('departments.couldNotLoadReallocation')} />
            ) : !reallocation.data?.suggestions.length ? (
              <EmptyState title={t('departments.balanced')} description={t('departments.balancedDesc')} />
            ) : (
              <div className="space-y-3">
                {reallocation.data.suggestions.map((s, i) => (
                  <div key={i} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        {s.from_department_name} <ArrowRight size={14} className="text-slate-400" /> {s.to_department_name}
                      </div>
                      <Badge tone={URGENCY_TONE[s.urgency]}>{t(`status.${s.urgency}`)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{s.rationale}</p>
                    <p className="mt-1 text-xs font-medium text-blue-600">{t('departments.moveHeadcount', { count: s.headcount_to_move })}</p>
                  </div>
                ))}
              </div>
            )}

            {reallocation.data?.loads && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('departments.loadIndexTitle')}</h4>
                <div className="space-y-1.5">
                  {reallocation.data.loads.map((l) => (
                    <div key={l.department_id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{l.department_name}</span>
                      <span className={l.load_index >= 1.3 ? 'font-semibold text-red-600' : l.load_index <= 0.7 ? 'font-semibold text-emerald-600' : 'text-slate-500'}>
                        {l.load_index.toFixed(2)}x · {l.open_tickets} open / {l.headcount} people
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}
